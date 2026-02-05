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
import type { CoreMessage } from "./coreMessages.js";
import {
  extractMessageContent,
  groupMessageChunks,
  getAssistantDisplayContent,
} from "./coreMessages.js";

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
  const [visibleChats, setVisibleChats] = useState<CoreMessage[]>([]);
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
  const graphStateRef = useRef<{ messages: CoreMessage[]; logs?: string; architecture?: string } | null>(null);
  const [graphState, setGraphState] = useState<{ messages: CoreMessage[]; logs?: string; architecture?: string } | null>(null);
  const messagesSentRef = useRef<CoreMessage[]>([]);
  const streamTextRef = useRef<string>("");
  const streamToolCallsRef = useRef<Array<{ toolCallId: string; toolName: string; args: unknown }>>([]);

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

          // AI SDK stream: accumulate parts and on finish append assistant message
          if (data.type === "response" && data.data?.stream === "ai-sdk") {
            const partType = data.data.partType as string;
            if (partType === "text-delta" && typeof data.data.text === "string") {
              streamTextRef.current += data.data.text;
            } else if (partType === "text" && typeof data.data.text === "string") {
              streamTextRef.current = data.data.text;
            } else if (partType === "tool-call") {
              streamToolCallsRef.current.push({
                toolCallId: String(data.data.toolCallId ?? ""),
                toolName: String(data.data.toolName ?? ""),
                args: data.data.args,
              });
            } else if (partType === "finish" || partType === "finish-step") {
              const text = streamTextRef.current;
              const toolCalls = streamToolCallsRef.current;
              const newAssistant: CoreMessage = {
                role: "assistant",
                content:
                  toolCalls.length > 0
                    ? [
                        ...(text ? [{ type: "text" as const, text }] : []),
                        ...toolCalls.map((tc) => ({
                          type: "tool-call" as const,
                          toolCallId: tc.toolCallId,
                          toolName: tc.toolName,
                          args: tc.args,
                        })),
                      ]
                    : text,
              };
              const fullList = [...messagesSentRef.current, newAssistant];
              setVisibleChats(fullList);
              setGraphState((prev) => ({
                messages: fullList,
                logs: prev?.logs ?? "",
                architecture: prev?.architecture ?? architecture,
              }));
              graphStateRef.current = { messages: fullList, logs: graphStateRef.current?.logs, architecture };
              setIsLoading(false);
              streamTextRef.current = "";
              streamToolCallsRef.current = [];
            } else if (partType === "error") {
              setIsLoading(false);
              streamTextRef.current = "";
              streamToolCallsRef.current = [];
            }
            return;
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

  const chatLines = useMemo(() => {
    if (!visibleChats || visibleChats.length === 0) return [];

    const grouped = groupMessageChunks(visibleChats);

    return grouped.messages.flatMap((msgs, index) => {
      const first = msgs[0];
      const content =
        first.role === "assistant"
          ? getAssistantDisplayContent(first)
          : extractMessageContent(msgs);
      if (!content || content.trim() === "") return [];

      const isHuman = first.role === "user";
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

    const userMessage: CoreMessage = { role: "user", content: userText };
    setVisibleChats((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const messages: CoreMessage[] =
      visibleChats.length > 0 ? [...visibleChats, userMessage] : [userMessage];
    const userQueryMessages = graphState ? [userMessage] : messages;
    messagesSentRef.current = graphState ? [...graphState.messages, userMessage] : messages;
    streamTextRef.current = "";
    streamToolCallsRef.current = [];

    const currentLogs = logsManager.getLogs() || "";
    const logs = graphState?.logs ?? currentLogs;
    if (logs.length === 0) {
      logd(`[chat] No logs in payload (expected: chat window is separate process). Backend will fetch via tool calls if needed.`);
    } else {
      logd(`[chat] Including logs in payload: ${logs.length} characters (from ${graphState?.logs ? "graphState" : "LogsManager"})`);
    }

    const payload = {
      type: "query",
      authKey: apiKey,
      serviceId: activeService.window_id,
      userQuery: {
        messages: userQueryMessages,
        architecture,
        logs,
        planningDoc: "",
      },
      planningDoc: "",
      graphState: graphState
        ? { messages: graphState.messages, logs: graphState.logs, architecture: graphState.architecture }
        : undefined,
    };

    if (graphState) {
      logd(`[chat] Sending query with graphState: ${graphState.messages?.length ?? 0} messages in state`);
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
