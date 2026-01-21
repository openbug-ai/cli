#!/usr/bin/env tsx

import React, { useEffect, useState, useMemo, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import WebSocket from "ws";
import fs from "fs";
import os from "os";
import path from "path";
import { fetchProjectsFromCluster, logd } from "./helpers/cli-helpers.js";
import { config } from "./config.js";
import logsManager from "./logsManager.js";
import {
  HumanMessage,
  BaseMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";
import {
  cleanMessagesContent,
  extractMessageContent,
  groupMessageChunks,
} from "./utils.js";

type ClusterProject = {
  path: string;
  description: string;
  name?: string;
  window_id: number;
  logs_available: boolean;
  code_available: boolean;
};

type ClusterProjectsResponse = {
  projects: ClusterProject[];
};

const HOME_DIR = os.homedir();
const OPENBUG_DIR = path.join(HOME_DIR, ".openbug");
const CONFIG_PATH = path.join(OPENBUG_DIR, "config");

function isCustomBackend(): boolean {
  const url = config.api_base_url || "";
  const defaultProdUrl = "https://api.oncall.build/v2/api";
  return !!url && url !== defaultProdUrl;
}

function loadApiKey(): string | null {
  try {
    const configText = fs.readFileSync(CONFIG_PATH, "utf8");
    const match = configText.match(/^API_KEY\s*=\s*(.*)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function buildArchitecture(projects: ClusterProject[]): string {
  function availableData(p: ClusterProject) {
    if (p.code_available && p.logs_available) {
      return `- codebase\n        - logs`;
    }
    if (p.code_available) return `- codebase`;
    if (p.logs_available) return `- logs`;
    return "";
  }

  let res = "";
  projects.forEach((project) => {
    res += `
      	id: ${project.window_id} 
        service_name: ${project.name || "Unknown Service"}
        service_description: ${project.description}
        available_data:
        ${availableData(project)}
        `;
  });
  return res;
}

const ChatApp: React.FC = () => {
  const { stdout } = useStdout();
  const [visibleChats, setVisibleChats] = useState<BaseMessage[]>([]);
  const [input, setInput] = useState("");
  const [services, setServices] = useState<ClusterProject[]>([]);
  const [activeService, setActiveService] = useState<ClusterProject | null>(
    null
  );
  const [architecture, setArchitecture] = useState<string>("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const graphStateRef = useRef<any>(null);
  const [graphState, setGraphState] = useState<any>(null);

  useEffect(() => {
    graphStateRef.current = graphState;
  }, [graphState]);

  const headerText = useMemo(() => {
    if (!services.length) return "No services connected";
    const names = services.map((s) => s.name || s.description || s.path);
    return names.join(", ");
  }, [services]);

  useEffect(() => {
    const key = loadApiKey();
    if (!key && !isCustomBackend()) {
      setError(
        "No API_KEY found in ~/.openbug/config. Please run `debug login <auth-key>` first."
      );
      return;
    }
    setApiKey(key);
  }, []);

  useEffect(() => {
    (async () => {
      // Hardcoded project id as per spec
      const md = { id: "openbug-service" } as any;
      const resp = (await fetchProjectsFromCluster(
        md
      )) as ClusterProjectsResponse | false;

      if (!resp || !resp.projects || resp.projects.length === 0) {
        setError(
          "No services are currently running for project 'openbug-service'.\nStart a service with `debug <command>` in that service directory to connect it to AI chat."
        );
        return;
      }

      setServices(resp.projects);
      const first = resp.projects[0];
      setActiveService(first);
      setArchitecture(buildArchitecture(resp.projects));

      const ws = new WebSocket(config.websocket_url);
      ws.onopen = () => {
        try {
          ws.send(
            JSON.stringify({
              type: "recurring_connection",
              ...(apiKey ? { authKey: apiKey } : {}),
              serviceId: first.window_id,
            })
          );
          setIsConnected(true);
          logd("Chat WebSocket connected");
        } catch (e) {
          setError("Failed to establish chat WebSocket connection");
        }
      };

      ws.onmessage = async (event) => {
        try {
          const raw = (event as any).data;
          let text = "";
          if (typeof raw === "string") {
            text = raw;
          } else if (raw instanceof ArrayBuffer) {
            text = Buffer.from(raw).toString("utf8");
          } else if (ArrayBuffer.isView(raw)) {
            text = Buffer.from(raw.buffer).toString("utf8");
          } else if (raw && typeof raw.toString === "function") {
            text = String(raw);
          }
          text = text?.trim?.() ?? "";
          if (!text) return;
          if (!(text.startsWith("{") || text.startsWith("["))) {
            return;
          }

          const data = JSON.parse(text);

          // Handle response messages exactly like the original useWebSocket
          if (data.type === "response") {
            let messages = data.data.messages ? data.data.messages : [];
            messages = mapStoredMessagesToChatMessages(messages);

            switch (data.data.type) {
              case "messages":
                if (
                  data.data.sender !== "toolNode" &&
                  data.data.sender !== "routerNode"
                ) {
                  const cleanedMessages = cleanMessagesContent(messages);
                  setVisibleChats((old) => [...old, ...cleanedMessages]);
                }
                break;

              case "values":
                if (data.data.state) {
                  logd(`[chat] Received values state update: ${data.data.state.messages?.length || 0} messages`);
                  if (data.data.state.messages?.length > 0) {
                    const lastMsg = data.data.state.messages[data.data.state.messages.length - 1];
                    if (lastMsg?.tool_calls) {
                      logd(`[chat] Last message has ${lastMsg.tool_calls.length} tool_calls`);
                    }
                  }
                  setGraphState(data.data.state);
                }
                break;

              case "updates":
                // Update graphState if state is provided in updates
                if (data.data.state) {
                  logd(`[chat] Received updates state: ${data.data.state.messages?.length || 0} messages`);
                  setGraphState(data.data.state);
                }
                if (
                  data.data.sender !== "toolNode" &&
                  data.data.sender !== "routerNode"
                ) {
                  const cleanedMessages = cleanMessagesContent(messages);
                  setVisibleChats((old) => [...old, ...cleanedMessages]);
                }
                if (data.data.sender === "answerNode") {
                  const cleanedMessages = cleanMessagesContent(messages);
                  setVisibleChats((prev) => [...prev, ...cleanedMessages]);
                  setIsLoading(false);
                }
                if (data.data.sender === "userNode") {
                  setIsLoading(false);
                }
                break;

              default:
                break;
            }
          }

          if (data.type === "error" || data.type === "ask_user") {
            setIsLoading(false);
          }
        } catch (e) {
          logd(`Chat WebSocket onmessage error: ${e}`);
          setIsLoading(false);
        }
      };

      ws.onerror = (e) => {
        logd(`Chat WebSocket error: ${e}`);
        setIsLoading(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        logd("Chat WebSocket closed");
      };

      setSocket(ws);
    })();
  }, [apiKey]);

  useInput((inputKey, key) => {
    if (key.ctrl && inputKey === "c") {
      if (socket) {
        socket.close();
      }
      process.exit(0);
    }
  });

  // Convert BaseMessage[] to displayable lines using the same logic as original
  const chatLines = useMemo(() => {
    if (!visibleChats || visibleChats.length === 0) {
      return [];
    }

    // Group messages by ID (same as original)
    const grouped = groupMessageChunks(visibleChats);

    return grouped.messages.flatMap((msgs, index) => {
      // Extract content from message group (same as original)
      const content = extractMessageContent(msgs);
      if (!content || content.trim() === "") {
        return [];
      }

      // Determine if it's a user or assistant message
      const msgAny = msgs as any;
      const msgType =
        (typeof msgAny[0].getType === "function" && msgAny[0].getType()) ||
        msgAny[0]._type ||
        "";
      const isHuman =
        msgType === "human" || msgs[0].constructor.name === "HumanMessage";

      // Split content into lines and create display lines
      const contentLines = content.split("\n");
      return contentLines.map((line, lineIndex) => ({
        key: `chat-${index}-line-${lineIndex}`,
        role: isHuman ? ("user" as const) : ("assistant" as const),
        text: line,
      }));
    });
  }, [visibleChats]);

  const handleSubmit = () => {
    if (!input.trim() || !socket || !isConnected || !activeService) return;
    const userText = input.trim();
    setInput("");

    // Add user message to visibleChats immediately
    const human = new HumanMessage(userText);
    setVisibleChats((prev) => [...prev, human]);
    setIsLoading(true);

    // Build query payload (same as original)
    const messages: BaseMessage[] = visibleChats.length > 0 
      ? [...visibleChats, human]
      : [human];
    
    const storedMessages = graphState
      ? mapChatMessagesToStoredMessages([human])
      : mapChatMessagesToStoredMessages(messages);

    // Get logs: backend merges as msg.graphState.logs || msg.userQuery.logs || ""
    // Note: The chat window runs in a separate process from service CLI instances,
    // so LogsManager will be empty here. The backend will fetch logs via tool calls
    // (read_logs, tail_logs, etc.) when needed. This is expected behavior.
    // If graphState has logs from a previous query, use those; otherwise send empty.
    const currentLogs = logsManager.getLogs() || "";
    const logs = graphState?.logs || currentLogs;
    if (logs.length === 0) {
      logd(`[chat] No logs in payload (expected: chat window is separate process). Backend will fetch via tool calls if needed.`);
    } else {
      logd(`[chat] Including logs in payload: ${logs.length} characters (from ${graphState?.logs ? 'graphState' : 'LogsManager'})`);
    }

    const payload = {
      type: "query",
      authKey: apiKey,
      serviceId: activeService.window_id,
      userQuery: {
        messages: storedMessages,
        architecture,
        logs: logs,
        planningDoc: "",
      },
      planningDoc: "",
      graphState: graphState || undefined,
    };

    // Debug logging
    if (graphState) {
      logd(`[chat] Sending query with graphState: ${graphState.messages?.length || 0} messages in state`);
      if (graphState.messages?.length > 0) {
        const lastMsg = graphState.messages[graphState.messages.length - 1];
        if (lastMsg?.tool_calls) {
          logd(`[chat] ⚠️  Last state message has ${lastMsg.tool_calls.length} tool_calls`);
          const toolCallIds = lastMsg.tool_calls.map((tc: any) => tc.id);
          const toolMessages = graphState.messages.filter((m: any) => 
            m.type === "tool" || m.lc?.[2] === "ToolMessage"
          );
          logd(`[chat] Tool messages in state: ${toolMessages.length} (expected: ${toolCallIds.length})`);
          if (toolMessages.length < toolCallIds.length) {
            logd(`[chat] ❌ MISSING TOOL RESPONSES in graphState!`);
          }
        }
      }
    } else {
      logd(`[chat] Sending query without graphState (first message)`);
    }

    try {
      socket.send(JSON.stringify(payload));
    } catch (e) {
      setError("Failed to send message to AI backend");
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (!activeService) {
    return (
      <Box flexDirection="column">
        <Text>Connecting to OpenBug cluster...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green">● </Text>
        <Text>{headerText}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {chatLines.map((line) => (
          <Text key={line.key}>
            {line.role === "user" ? "> " : "⏺ "}
            {line.text}
          </Text>
        ))}
        {isLoading && (
          <Text color="grey">
            <Text>⏺ </Text>
            <Text> Thinking...</Text>
          </Text>
        )}
      </Box>
      <Box marginTop={1}>
        <TextInput
          placeholder={
            isConnected
              ? "Ask OpenBug about your services..."
              : "Connecting..."
          }
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
        />
      </Box>
    </Box>
  );
};

export default ChatApp;
