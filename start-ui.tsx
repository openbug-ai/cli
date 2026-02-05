#!/usr/bin/env tsx

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useInput, useApp, render, Box, Text, useStdout } from "ink";
import TextInput from "ink-text-input";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { useWebSocket } from "./useWebSocket.js";
import { config } from "./config.js";
import logsManager from "./logsManager.js";
import {
  fetchProjectsFromCluster,
  logd,
  loadProjectMetadata,
  getConfigValue,
} from "./helpers/cli-helpers.js";
import { extractMessageContent, groupMessageChunks } from "./utils.js";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  AIMessageChunk,
} from "langchain";
import { SystemMessage } from "@langchain/core/messages";
import stringWidth from "string-width";
import WebSocket from "ws";

marked.use(
  markedTerminal({
    reflowText: false,
    showSectionPrefix: false,
    unescape: true,
    emoji: true,
  })
);

function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = stringWidth(testLine);

    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

interface ActiveConnection {
  id: string;
  description?: string;
  name?: string;
  path?: string;
  window_id?: number;
  logs_available?: boolean;
  code_available?: boolean;
}

type Project = {
  path: string;
  description: string;
  name?: string;
  window_id: number;
  logs_available: boolean;
  code_available: boolean;
};

function generateArchitecture(projects: Project[]) {
  let res = "";
  function avaiableData(project: Project) {
    if (project.code_available && project.logs_available) {
      return `- codebase 
        - logs`;
    }
    if (project.code_available) return `- codebase`;
    if (project.logs_available) return `- logs`;
  }
  projects.forEach((project) => {
    res += `
      	id: ${project.window_id} 
        service_name: ${project.name}
        service_description: ${project.description}
        available_data:
        ${avaiableData(project)}
        `;
  });
  return res;
}

async function fetchLogsFromCluster(
  windowId: number,
  clusterUrl = getConfigValue("CLUSTER_URL", "ws://127.0.0.1:4466")
): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(clusterUrl);
    } catch (error) {
      logd(`[fetchLogsFromCluster] Failed to create WebSocket: ${error}`);
      resolve("");
      return;
    }

    const cleanup = () => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {}
    };

    const timeoutId = setTimeout(() => {
      logd(
        `[fetchLogsFromCluster] Timeout waiting for logs for window_id: ${windowId}`
      );
      cleanup();
      resolve("");
    }, 5000);

    socket.onopen = () => {
      try {
        logd(
          `[fetchLogsFromCluster] Requesting logs for window_id: ${windowId}`
        );
        socket?.send(
          JSON.stringify({
            type: "fetch_logs",
            window_id: windowId,
          })
        );
      } catch (error) {
        logd(
          `[fetchLogsFromCluster] Error sending fetch_logs request: ${error}`
        );
        cleanup();
        resolve("");
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.type === "fetch_logs_ack") {
          cleanup();
          clearTimeout(timeoutId);
          const logs = data.logs || "";
          logd(
            `[fetchLogsFromCluster] Received ${logs.length} characters of logs for window_id: ${windowId}`
          );
          resolve(logs);
        } else if (data.type === "error") {
          logd(
            `[fetchLogsFromCluster] Error from cluster server: ${data.message}`
          );
          cleanup();
          resolve("");
        }
      } catch (error) {
        logd(`[fetchLogsFromCluster] Error parsing response: ${error}`);
      }
    };

    socket.onerror = (error) => {
      logd(`[fetchLogsFromCluster] WebSocket error: ${error}`);
      cleanup();
      resolve("");
    };

    socket.onclose = () => {
      if (!settled) {
        logd(
          `[fetchLogsFromCluster] WebSocket closed before receiving response for window_id: ${windowId}`
        );
        cleanup();
        resolve("");
      }
    };
  });
}
//props for the border
interface BorderBoxProps {
  children: React.ReactNode;
  borderColor: string;
}

//border for the content
const BorderBox: React.FC<BorderBoxProps> = ({ children, borderColor }) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={borderColor}
    paddingX={1}
    paddingY={0}
    marginRight={1}
    width="100%"
    overflow="hidden"
  >
    {children}
  </Box>
);

const AnimatedLoadingText: React.FC<{ message: string }> = ({ message }) => {
  const [colorIntensity, setColorIntensity] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setColorIntensity((prev) => (prev + 1) % 4);
    }, 800);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const colors = ["yellow", "yellowBright", "yellow", "yellowBright"];
  const currentColor = colors[colorIntensity];

  return (
    <Text color={currentColor} dimColor={colorIntensity % 2 === 0}>
      {message}
    </Text>
  );
};

export const StartApp: React.FC = () => {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const [activeConnections, setActiveConnections] = useState<
    ActiveConnection[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [terminalCols, setTerminalCols] = useState<number>(
    stdout?.columns || 80
  );
  const [showFullChat, setShowFullChat] = useState(false);

  const activeProject = activeConnections[0];
  const projectMetadata = useMemo(() => {
    if (!activeProject) return undefined;
    return {
      id: activeProject.id,
      description: activeProject.description || "",
      name: activeProject.name || "",
      window_id: activeProject.window_id || Date.now(),
      logs_available: activeProject.logs_available !== false,
      code_available: activeProject.code_available !== false,
      path: activeProject.path || process.cwd(),
    };
  }, [activeProject]);
  const {
    connectWebSocket,
    visibleChats,
    setVisibleChats,
    sendQuery,
    isConnected,
    connectionError,
    isLoading,
    customMessage,
    chatResponseMessages,
    setChatResponseMessages,
    setTrimmedChats,
    setGraphState,
    setIsLoading,
    setShowControlR,
  } = useWebSocket(config.websocket_url, logsManager, projectMetadata);

  useEffect(() => {
    let clusterSocket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isIntentionallyClosed = false;

    const connectToCluster = () => {
      try {
        const clusterUrl = getConfigValue(
          "CLUSTER_URL",
          "ws://127.0.0.1:4466"
        );
        clusterSocket = new WebSocket(clusterUrl);

        clusterSocket.onopen = () => {
          clusterSocket?.send(
            JSON.stringify({
              type: "subscribe_updates",
              id: "openbug-service",
            })
          );
          logd("Subscribed to cluster server for project updates");
        };

        clusterSocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data.toString());

            if (
              data.type === "project_update" &&
              Array.isArray(data.projects)
            ) {
              const oncallServices = data.projects;
              setActiveConnections(oncallServices);
              logd(
                `Project update received: ${oncallServices.length} active connection(s) for openbug-service`
              );
            } else if (
              (data.type === "projects" ||
                data.type === "fetch_projects_ack") &&
              Array.isArray(data.projects)
            ) {
              const oncallServices = data.projects;
              setActiveConnections(oncallServices);
              logd(
                `Found ${oncallServices.length} active connection(s) for openbug-service`
              );
            }
          } catch (error) {
            logd(`Error parsing cluster response: ${error}`);
          }
        };

        clusterSocket.onerror = (error) => {
          logd("Cluster server connection error. Will attempt to reconnect...");
        };

        clusterSocket.onclose = () => {
          clusterSocket = null;
          if (!isIntentionallyClosed) {
            reconnectTimeout = setTimeout(() => {
              logd("Reconnecting to cluster server...");
              connectToCluster();
            }, 3000);
          }
        };
      } catch (error) {
        logd(`Error connecting to cluster server: ${error}`);
        reconnectTimeout = setTimeout(() => {
          connectToCluster();
        }, 3000);
      }
    };

    connectToCluster();

    return () => {
      isIntentionallyClosed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (clusterSocket) {
        clusterSocket.close();
      }
    };
  }, []);

  useEffect(() => {
    if (activeProject && activeProject.window_id) {
      const timer = setTimeout(() => {
        connectWebSocket();
      }, 100);
      return () => clearTimeout(timer);
    } else if (activeConnections.length === 0) {
      logd("No active connections found. Waiting for services to register...");
    }
  }, [connectWebSocket, activeProject, activeConnections.length]);

  useEffect(() => {
    const handleResize = () => {
      if (stdout?.columns) {
        setTerminalCols(stdout.columns);
      }
    };

    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, [stdout]);

  const handleSubmit = async (value: string) => {
    if (isLoading) {
      return;
    }
    if (!value.trim() || !activeProject) {
      if (!activeProject) {
        logd(
          "No active project available. Please wait for a service to register."
        );
      }
      return;
    }

    const userMessage = new HumanMessage(value.trim());
    const updatedChats = [...visibleChats, userMessage];
    setVisibleChats(updatedChats);
    setChatResponseMessages((prev) => [...prev, userMessage]);
    setTrimmedChats((prev) => [...prev, userMessage]);
    setChatInput("");

    let logs: string = "";

    if (activeProject?.logs_available && activeProject.window_id) {
      const logsFromManager = logsManager.getLogs();
      if (logsFromManager && logsFromManager.trim().length > 0) {
        logs = logsFromManager;
        // console.log(
        //   `[Logs] Sending ${logs.length} characters of logs from logsManager to backend`
        // );
      } else {
        try {
          // console.log(
          //   `[handleSubmit] Fetching logs from cluster server for active project window_id: ${activeProject.window_id}`
          // );
          const logsFromCluster = await fetchLogsFromCluster(
            activeProject.window_id
          );

          if (logsFromCluster && logsFromCluster.trim().length > 0) {
            logs = logsFromCluster;
            // console.log(
            //   `[Logs] ✅ Fetched ${logs.length} characters of logs from cluster server for window_id: ${activeProject.window_id}`
            // );
          } else {
            logs = "";
            console.log(
              `[Logs] ⚠️  No logs found in cluster server for window_id: ${activeProject.window_id}. This might be normal if the service just started.`
            );
            logd(
              `[handleSubmit] No logs available for window_id: ${activeProject.window_id}. Service might not have generated logs yet.`
            );
          }
        } catch (error) {
          logs = "";
          console.log(
            `[Logs] ❌ Failed to fetch logs from cluster server: ${error}`
          );
          logd(
            `[handleSubmit] Error fetching logs from cluster server: ${error}`
          );
        }
      }
    } else {
      if (!activeProject?.logs_available) {
        logd(
          `[handleSubmit] Active project has logs_available=false, skipping log fetch`
        );
      } else if (!activeProject.window_id) {
        logd(
          `[handleSubmit] Active project missing window_id, cannot fetch logs`
        );
      }
      logs = "";
    }

    if (logs === undefined) {
      logs = "";
    }
    try {
      let architecture = "";

      try {
        // console.log(`[handleSubmit] Fetching projects from cluster server`);

        let metadataForFetch = null;
        if (activeProject?.path) {
          metadataForFetch = loadProjectMetadata(activeProject.path);
        }

        if (!metadataForFetch && activeProject) {
          metadataForFetch = {
            id: "openbug-service",
            path: activeProject.path || process.cwd(),
          };
        }
        const projects = await fetchProjectsFromCluster(metadataForFetch);

        if (projects && projects.projects && Array.isArray(projects.projects)) {
          architecture = generateArchitecture(projects.projects);
        } else {
          if (activeProject && activeProject.window_id) {
            const project: Project = {
              path: activeProject.path || process.cwd(),
              description: activeProject.description || "",
              name: activeProject.name,
              window_id: activeProject.window_id,
              logs_available: activeProject.logs_available !== false,
              code_available: activeProject.code_available !== false,
            };
            architecture = generateArchitecture([project]);
          }
        }
      } catch (clusterError) {
        if (activeProject && activeProject.window_id) {
          const project: Project = {
            path: activeProject.path || process.cwd(),
            description: activeProject.description || "",
            name: activeProject.name,
            window_id: activeProject.window_id,
            logs_available: activeProject.logs_available !== false,
            code_available: activeProject.code_available !== false,
          };
          architecture = generateArchitecture([project]);
        }
      }

      if (!architecture) {
        logd("No architecture available. Cannot send query.");
        return;
      }

      const initialSystemMessage =
        "I'm watching your app run locally. You can ask me about errors, logs, performance,or anything else related to this run.";
      const messagesToSend = updatedChats.filter((msg) => {
        if (msg instanceof SystemMessage) {
          const content = typeof msg.content === "string" ? msg.content : "";
          return content !== initialSystemMessage;
        }
        return true;
      });

      sendQuery(messagesToSend, architecture, logs, "");
    } catch (error) {
      logd(`Error sending message: ${error}`);
    }
  };

  const initialAssistantMessage = new SystemMessage(
    "I'm watching your app run locally. You can ask me about errors, logs, performance,or anything else related to this run."
  );

  useInput((inputStr: string, key: any) => {
    if (inputStr === "c" && key.ctrl) {
      exit();
      return;
    }

    if (key.ctrl && inputStr === "a") {
      setShowFullChat((prev) => !prev);
      return;
    }

    if (key.ctrl && inputStr === "r") {
      setShowControlR(false);
      setChatResponseMessages(() => []);
      setTrimmedChats(() => []);
      setVisibleChats([initialAssistantMessage]);
      setGraphState(null);
      setIsLoading(false);
      setChatInput("");
      return;
    }
  });

  const chatLines = useMemo(() => {
    const availableWidth = terminalCols - 4; // Padding
    const lines: Array<{ key: string; text: string }> = [];

    const messagesToRender = showFullChat ? chatResponseMessages : visibleChats;
    if (!messagesToRender || messagesToRender.length <= 0) {
      return [];
    }

    const groupedMessages = groupMessageChunks(messagesToRender).messages;

    return groupedMessages.flatMap((msgs, index) => {
      const msgAny = msgs as any;
      const msgType =
        (typeof msgAny[0]?.getType === "function" && msgAny[0].getType()) ||
        msgAny[0]?._type ||
        msgs[0]?.constructor.name ||
        "";
      const isHuman =
        msgType === "human" || msgs[0]?.constructor.name === "HumanMessage";
      const prefix = `${isHuman ? ">" : "⏺"} `;
      const prefixWidth = stringWidth(prefix);

      let content = extractMessageContent(msgs);

      const fMessage = msgs[0] as AIMessage;
      if (fMessage.tool_calls && fMessage.tool_calls.length > 0) {
        if (fMessage.tool_calls[0].name === "thinkTool") {
          function extractThinkMessage(messages: AIMessageChunk[]): string {
            if (messages.length < 5) return "";
            return messages.slice(4, -3).reduce((prev, message) => {
              if (
                message.tool_call_chunks &&
                message.tool_call_chunks[0] &&
                message.tool_call_chunks[0].args
              )
                return prev + message.tool_call_chunks[0].args;
              return prev;
            }, "");
          }
          content = extractThinkMessage(msgs as AIMessageChunk[]);
        } else {
          content = `Calling: ${fMessage.tool_calls[0].name}`;
        }
      }

      if (content === "") return [];

      const renderedContent = marked.parse(content) as string;
      const renderedLines = renderedContent.split("\n");
      
      const messageLines = renderedLines.flatMap((line, lineIndex) => {
        const fullLine =
          lineIndex === 0 ? prefix + line : " ".repeat(prefixWidth) + line;
        const wrappedLines = wrapText(fullLine, availableWidth);

        return wrappedLines.map((wrappedLine, wrapIndex) => ({
          key: `chat-${index}-line-${lineIndex}-wrap-${wrapIndex}`,
          text: wrappedLine,
        }));
      });

      messageLines.push({
        key: `chat-${index}-spacer`,
        text: " ",
      });

      return messageLines;
    });
  }, [visibleChats, chatResponseMessages, showFullChat, terminalCols]);

  const connectionsLine = useMemo(() => {
    if (activeConnections.length === 0) {
      return "No active connections found (project: openbug-service)";
    }
    const services = activeConnections
      .map(
        (c, i) =>
          `  ${i + 1}. ${c.name || "Unnamed"} (${c.path || "unknown path"})`
      )
      .join("\n");
    return `Active connections (openbug-service): ${activeConnections.length} service(s)\n${services}`;
  }, [activeConnections]);

  //set user entered input text to setChatInput
  const setChatInputText = (userInput) => {
    if (!isConnected || isLoading) return;
    setChatInput(userInput);
  };
  return (
    <Box flexDirection="column" width="100%">
      <Text color="cyan" bold>
        {connectionsLine}
      </Text>
      <Text>{"─".repeat(terminalCols || 80)}</Text>

      {chatLines.map((line) => {
        return <Text key={line.key}>{line.text}</Text>;
      })}

      {isLoading && customMessage && (
        <AnimatedLoadingText message={customMessage} />
      )}

      {connectionError && (
        <Box flexDirection="column" marginY={1} paddingX={1}>
          <Text color="red" bold>⚠️  Connection Error</Text>
          <Box marginTop={1} flexDirection="column">
            {connectionError.split('\n').map((line, idx) => (
              <Text key={idx} color="red">{line || ' '}</Text>
            ))}
          </Box>
        </Box>
      )}

      {isConnected && (
        <BorderBox borderColor={isConnected ? "greenBright" : "gray"}>
          <Box flexDirection="row" alignItems="center">
            <Text color="green">{"→ "}</Text>
            <TextInput
              value={chatInput}
              onChange={setChatInputText}
              onSubmit={handleSubmit}
              placeholder={
                isLoading
                  ? "AI is thinking, please wait..."
                  : isConnected
                  ? "Type your message..."
                  : "Connecting..."
              }
            />
          </Box>
        </BorderBox>
      )}

        <Text color="gray" dimColor>
          {isConnected ? "● Connected" : "○ Disconnected"} | Press Ctrl+C to
          exit | Press Ctrl+R to reset chat | Press Ctrl+A to toggle full chat
        </Text>
    </Box>
  );
};

console.clear();
render(<StartApp />);
