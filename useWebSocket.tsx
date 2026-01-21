import { useCallback, useEffect, useRef, useState } from "react";
import WebSocket from "ws";
import {
  getContextLines,
  cleanMessagesContent,
} from "./utils.js";
import { config } from "./config.js";
import { toolFunctionCall } from "./api.js";
import { BaseMessage } from "langchain";
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  SystemMessage,
  AIMessage,
} from "@langchain/core/messages";
import axios from "axios";
import { ripgrepSearch } from "./helpers/ripgrep-tool.js";
import { loadProjectMetadata, logd } from "./helpers/cli-helpers.js";
import { LogsManager } from "./logsManager.js";
import os from "os";
import path from "path";

function buildConnectionErrorMessage(url: string, errorType: string): string {
  const configPath = path.join(os.homedir(), ".openbug", "config");
  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
  
  let baseMessage = "";
  let suggestion = "";

  if (errorType === "timeout" || errorType.includes("ETIMEDOUT")) {
    baseMessage = "Connection timeout: Unable to connect to backend server.";
    suggestion = isLocalhost
      ? "Make sure the backend server is running on the configured port."
      : "Check your network connection and backend server status.";
  } else if (errorType.includes("ECONNREFUSED") || errorType.includes("refused")) {
    baseMessage = "Connection refused: Backend server is not running or not accessible.";
    suggestion = isLocalhost
      ? `Start the backend server first. Check if it's running on ${url.replace("ws://", "").replace("wss://", "")}`
      : `Verify the backend server is running and accessible at ${url}`;
  } else if (errorType.includes("ENOTFOUND") || errorType.includes("getaddrinfo")) {
    baseMessage = "Host not found: Cannot resolve backend server address.";
    suggestion = `Check your WEB_SOCKET_URL configuration. Current: ${url}`;
  } else if (errorType.includes("close_code_1006")) {
    baseMessage = "Connection closed unexpectedly: Backend server may have stopped.";
    suggestion = "Check if the backend server is still running.";
  } else {
    baseMessage = "Failed to connect to backend server.";
    suggestion = "Check your configuration and ensure the backend is running.";
  }

  return `${baseMessage}\n\n${suggestion}\n\nConfiguration file: ${configPath}\nCurrent API Base URL: ${config.api_base_url}\nCurrent WebSocket URL: ${url}\n\nTo fix:\n1. Ensure backend is running\n2. Check ~/.openbug/config and set WEB_SOCKET_URL and API_BASE_URL as environment variables\n3. Verify the URL matches your backend server address`;
}

export function useWebSocket(
  url: string,
  rawLogData: LogsManager,
  overrideMetadata?: any
) {
  //refs
  const socketRef = useRef<WebSocket | null>(null);
  const summarizeInProgressRef = useRef<boolean>(false);
  const graphStateRef = useRef<any>(null);
  const latestGraphStateRef = useRef<any>(null);
  const overrideMetadataRef = useRef<any>(overrideMetadata);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [chatResponseMessages, setChatResponseMessages] = useState<
    BaseMessage[]
  >([]);
  const [trimmedChats, setTrimmedChats] = useState<BaseMessage[]>([]);
  const initialAssistantMessage = new SystemMessage(
    "I'm watching your app run locally. You can ask me about errors, logs, performance,or anything else related to this run."
  );
  const [isConnected, setIsConnected] = useState(false);
  const [visibleChats, setVisibleChats] = useState<BaseMessage[]>([
    initialAssistantMessage,
  ]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showControlR, setShowControlR] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<any>(null);
  const isConnectedRef = useRef<boolean>(false);

  useEffect(() => {
    graphStateRef.current = graphState;
  }, [graphState]);

  useEffect(() => {
    overrideMetadataRef.current = overrideMetadata;
  }, [overrideMetadata]);

  const initialProjectMetadata = overrideMetadata || loadProjectMetadata();
  const getProjectMetadata = () =>
    overrideMetadataRef.current ||
    loadProjectMetadata() ||
    initialProjectMetadata;
  const getServiceId = () => getProjectMetadata()?.window_id;
  const hasLogsAccess = () => {
    const value = getProjectMetadata()?.logs_available;
    return value === undefined ? true : value;
  };
  const hasCodeAccess = () => {
    const value = getProjectMetadata()?.code_available;
    return value === undefined ? true : value;
  };

  const callSummarizeAPI = useCallback(
    async (currentGraphState: any) => {
      if (summarizeInProgressRef.current) {
        logd("[summarize] Summarize API call already in progress.");
        return;
      }

      if (!currentGraphState || typeof currentGraphState !== "object") {
        logd("[summarize] No graphState available");
        return;
      }

      summarizeInProgressRef.current = true;
      logd("[summarize] Calling summarize API with graphState");

      try {
          const response = await axios.post(
            `${config.api_base_url}/graph/summarize`,
            {
              graphState: currentGraphState,
            }
          );

        if (response.data && response.data.success && response.data.summary) {
          const summaryText = response.data.summary;
          const summaryMessage = new AIMessage(
            `Current Approach Summary:\n${summaryText}`
          );

          setVisibleChats((old) => [...old, summaryMessage]);
          setTrimmedChats((old) => [...old, summaryMessage]);
          setChatResponseMessages((old) => [...old, summaryMessage]);

          setGraphState((prevState: any) => {
            if (!prevState) return prevState;

            const storedMessages = mapChatMessagesToStoredMessages([
              summaryMessage,
            ]);
            const storedSummaryMessage =
              storedMessages && storedMessages.length > 0
                ? storedMessages[0]
                : null;

            if (!storedSummaryMessage) {
              return prevState;
            }

            return {
              ...prevState,
              messages: [...(prevState.messages || []), storedSummaryMessage],
            };
          });
        } else {
          throw new Error("Invalid response from summarize API");
        }
      } catch (error: any) {
        logd(
          `[summarize] ❌ Error calling summarize API: ${
            error instanceof Error ? error.message : String(error)
          }`
        );

        const errorMessage = new AIMessage(
          "Something went wrong. Please try asking the question again." +
            error.message
        );
        setVisibleChats((old) => [...old, errorMessage]);
        setTrimmedChats((old) => [...old, errorMessage]);
        setChatResponseMessages((old) => [...old, errorMessage]);

        setGraphState((prevState: any) => {
          if (!prevState) return prevState;

          const storedMessages = mapChatMessagesToStoredMessages([
            errorMessage,
          ]);
          const storedErrorMessage =
            storedMessages && storedMessages.length > 0
              ? storedMessages[0]
              : null;

          if (!storedErrorMessage) {
            return prevState;
          }

          return {
            ...prevState,
            messages: [...(prevState.messages || []), storedErrorMessage],
          };
        });
      } finally {
        summarizeInProgressRef.current = false;
      }
    },
    []
  );

  //web socket connection
  const connectWebSocket = useCallback(() => {
    // const d = fs.readFileSync('logs')
    // fs.writeFileSync('logs', `${d} inside connectWS \n message: ${url} ${authKey} ${serviceId}`)
    // if (!url || !authKey || serviceId.trim() === "") {
    //   return;
    // }
    if (socketRef.current) {
      socketRef.current.close();
    }

    const socket = new WebSocket(url);
    socketRef.current = socket;
    setConnectionError(null);
    setIsConnected(false);

    // Connection timeout - if connection doesn't establish within 10 seconds, show error
    const connectionTimeout = setTimeout(() => {
      if (!isConnectedRef.current && socket.readyState !== WebSocket.OPEN) {
        const errorMsg = buildConnectionErrorMessage(url, "timeout");
        setConnectionError(errorMsg);
        setIsConnected(false);
        setIsLoading(false);
        socket.close();
      }
    }, 10000);

    socket.onopen = () => {
      clearTimeout(connectionTimeout);
      try {
        const md = getProjectMetadata();
        if (!md?.window_id) {
          setConnectionError(
            "Missing serviceId (window_id). Please ensure a service is registered with the cluster."
          );
          console.log("Missing serviceId (window_id). Metadata:", md);
          return;
        }
        socket.send(
          JSON.stringify({
            type: "recurring_connection",
            serviceId: md.window_id,
          })
        );
      } catch (error) {
        console.error("[DEBUG useWebSocket] Error in socket.onopen:", error);
        setConnectionError("Failed to establish connection. Please check your configuration.");
      }
    };

    socket.onmessage = async (event) => {
      // setShowControlR(false);
      try {
        const raw = (event as any).data;
        let text = "";
        if (typeof raw === "string") {
          text = raw;
        } else if (raw instanceof ArrayBuffer) {
          text = Buffer.from(raw).toString("utf8");
        } else if (ArrayBuffer.isView(raw)) {
          // @ts-ignore - handle typed arrays
          text = Buffer.from(raw.buffer).toString("utf8");
        } else if (raw && typeof raw.toString === "function") {
          text = String(raw);
        }
        text = text?.trim?.() ?? "";
        if (!text) return; // ignore empty frames
        if (!(text.startsWith("{") || text.startsWith("["))) {
          return; // ignore non-JSON frames
        }
        const data = JSON.parse(text);
        // if (data.type === "user_assigned" && data.socketId) {
        if (data.type === "user_assigned") {
          isConnectedRef.current = true;
          setIsConnected(true);
          setConnectionError(null); // Clear any previous errors on successful connection
          setSocketId(data.socketId);
        }
        
        // Handle error messages from server
        if (data.type === "error") {
          const errorMessage = data.message || "Server error occurred";
          setConnectionError(`Server Error: ${errorMessage}`);
          setIsConnected(false);
          setIsLoading(false);
        }
        if (
          ![
            "ack",
            "ask_user",
            "response",
            "error",
            "tool_function_call",
            "ask_user",
            "progress",
          ].includes(data.type)
        ) {
          return;
        }
        if (data.type === "tool_function_call") {
          if (data.function_name === "read_file") {
            logd(
              `[read_file] 📥 Tool call received: tool_call_id=${
                data.tool_call_id
              }, args=${JSON.stringify(data.args)}`
            );

            if (!hasCodeAccess()) {
              logd(`[read_file] ⚠️  No code access, denying tool`);
              await denyToolAccess("read_file", data);
              return;
            }

            const argsData = {
              filePath: data.args.filePath,
              lineNumber: data.args.lineNumber,
              before: data.args.before || 30,
              after: data.args.after || 30,
            };

            logd(
              `[read_file] 📋 Extracted args: filePath=${argsData.filePath}, lineNumber=${argsData.lineNumber}, before=${argsData.before}, after=${argsData.after}`
            );
            logd(`[read_file] 🔍 Calling getContextLines...`);

            const result = getContextLines(
              argsData.filePath,
              argsData.lineNumber,
              argsData.before,
              argsData.after
            );

            logd(
              `[read_file] ✅ File content extracted: resultLength=${
                result.length
              }, resultLines=${result.split("\n").length}, isEmpty=${
                result.trim().length === 0
              }`
            );
            logd(
              `[read_file] 📄 Result preview (first 300 chars): ${result.substring(
                0,
                300
              )}${result.length > 300 ? "..." : ""}`
            );

            await postToolCallResult(data, result, setChatResponseMessages);
            logd(`[read_file] 📤 Result sent to backend successfully`);
            // await redisClient.set(data.tool_call_id, result, { EX: 120 });
            return;
          }
          if (data.function_name === "grep_search") {
            if (!hasCodeAccess()) {
              await denyToolAccess("grep_search", data);
              return;
            }
            await grepSearch(data.args.searchTerm, data);
            return;
          }
          if (data.function_name === "read_logs") {
            if (!hasLogsAccess()) {
              await denyToolAccess("read_logs", data);
              return;
            }
            await readLogs(data.args.pageNumber, data);
            return;
          }
          if (data.function_name === "tail_logs") {
            if (!hasLogsAccess()) {
              await denyToolAccess("tail_logs", data);
              return;
            }
            await tailLogs(data.args.n, data);
            return;
          }
          if (data.function_name === "grep_logs") {
            if (!hasLogsAccess()) {
              await denyToolAccess("grep_logs", data);
              return;
            }
            await grepLogs(
              data.args.pattern,
              data.args.before,
              data.args.after,
              data
            );
            return;
          }
          if (data.function_name === "get_recent_errors") {
            if (!hasLogsAccess()) {
              await denyToolAccess("get_recent_errors", data);
              return;
            }
            await getRecentErrors(data.args.n, data);
            return;
          }
        }

        // trimmed - imp msgs
        // visible - shown
        // chatresponses - all

        // add non-progress responses to trimmedChats
        // @todo this is where the messages get trimmed
        // if (data.type !== "progress") {
        //   setTrimmedChats((prevTrimmed) => {
        //     const updated = [...prevTrimmed, data];
        //     // update visible chats with all trimmed messages
        //     setVisibleChats(updated);
        //     return updated;
        //   });
        // }
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
              // logd(`LOGGING RESPONSE SENDER: ${data.data.sender}`);
              break;

            case "values":
              if (data.data.state) {
                setGraphState(data.data.state);
                latestGraphStateRef.current = data.data.state;
              }
              break;

            case "updates":
              if (
                data.data.sender !== "toolNode" &&
                data.data.sender !== "routerNode"
              ) {
                const cleanedMessages = cleanMessagesContent(messages);
                setChatResponseMessages((old) => [...old, ...cleanedMessages]);
              }
              if (data.data.sender === "answerNode") {
                const cleanedMessages = cleanMessagesContent(messages);
                setTrimmedChats((prev) => {
                  setVisibleChats([...prev, ...cleanedMessages]);
                  return [...prev, ...cleanedMessages];
                });
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
        if (data.type === "error") {
          setIsLoading(false);
          setCustomMessage(null);

          const currentGraphState = latestGraphStateRef.current || graphStateRef.current;
          if (currentGraphState) {
            callSummarizeAPI(currentGraphState);
          }
        }
        
        if (data.type === "ask_user") {
          setIsLoading(false);
          setCustomMessage(null);
        }
      } catch (error) {
        setIsLoading(false);
        const currentGraphState = latestGraphStateRef.current || graphStateRef.current;
        if (currentGraphState) {
          callSummarizeAPI(currentGraphState);
        }

        return;
      }
    };

    socket.onerror = (error: any) => {
      clearTimeout(connectionTimeout);
      isConnectedRef.current = false;
      // console.error(`[WebSocket] Connection error:`, error);
      
      // Extract error code/message from the error event
      const errorCode = error?.code || error?.message || error?.type || "unknown";
      const errorMsg = buildConnectionErrorMessage(url, errorCode);
      setConnectionError(errorMsg);
      setIsConnected(false);
      setIsLoading(false);
      setTimeout(() => {
        setConnectionError(null);
        process.exit();
      }, 10000);
    };

    socket.onclose = (event) => {
      clearTimeout(connectionTimeout);
      isConnectedRef.current = false;
      
      if (event.code !== 1000 && !isConnectedRef.current) {
        const errorMsg = buildConnectionErrorMessage(url, `close_code_${event.code}`);
        setConnectionError(errorMsg);
        setIsConnected(false);
        setIsLoading(false);
      }
    };
  }, [url, callSummarizeAPI]);

  const sendQuery = useCallback(
    (
      messages: BaseMessage[],
      architecture: string,
      logs?: string,
      planningDoc?: string
    ) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        setIsLoading(true);

        setCustomMessage("🤔 Thinking...");
        const md = getProjectMetadata();
        const payload = {
          type: "query",
          serviceId: md?.window_id,
          userQuery: {
            messages: graphState
              ? mapChatMessagesToStoredMessages([messages[messages.length - 1]])
              : mapChatMessagesToStoredMessages(messages),
            architecture: architecture,
            logs,
            planningDoc: "",
          },
          planningDoc,
          graphState: graphState || undefined,
        };
        // console.log("[sendQuery] Payload:", JSON.stringify(payload, null, 2));
        socket.send(JSON.stringify(payload));
      } else {
        const errorMsg = socket
          ? `WebSocket not open (state: ${socket.readyState}, OPEN=${WebSocket.OPEN})`
          : "WebSocket not initialized";
        logd(`[sendQuery] Cannot send: ${errorMsg}`);
        setConnectionError("WebSocket not connected");
        throw new Error(`Cannot send the message: ${errorMsg}`);
      }
    },
    [socketId, graphState]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        // socketRef.current.close();
      }
    };
  }, []);

  async function grepSearch(searchTerm: string, data) {
    logd(
      `[grepSearch] 🔍 Grep search invoked: searchTerm=${searchTerm}, tool_call_id=${
        data.tool_call_id
      }, args=${JSON.stringify(data.args)}`
    );
    const projectMetadata = getProjectMetadata();
    const workingDirectory = projectMetadata?.path || process.cwd();

    logd(
      `[grepSearch] 📁 Working directory: workingDirectory=${workingDirectory}, projectPath=${
        projectMetadata?.path || "N/A"
      }, processCwd=${process.cwd()}`
    );

    const maxResults = data.args?.max_results || 20;
    const caseSensitive = data.args?.case_sensitive || false;
    const fileTypes = data.args?.file_types || [];

    logd(
      `[grepSearch] ⚙️  Search options: maxResults=${maxResults}, caseSensitive=${caseSensitive}, fileTypes=${JSON.stringify(
        fileTypes
      )}`
    );

    try {
      const results = await ripgrepSearch(searchTerm, {
        maxResults,
        caseSensitive,
        fileTypes,
        workingDirectory,
      });

      logd(
        `[grepSearch] ✅ Search completed: resultCount=${
          results.length
        }, results=${JSON.stringify(
          results.map((r) => ({
            filePath: r.filePath,
            line: r.line,
            previewLength: r.preview?.length || 0,
          }))
        )}`
      );

      await postToolCallResult(data, results, setChatResponseMessages);
    } catch (error) {
      logd(
        `[grepSearch] ❌ Error during grep search: ${
          error instanceof Error ? error.message : String(error)
        }, stack=${error instanceof Error ? error.stack : "N/A"}`
      );
      await postToolCallResult(data, [], setChatResponseMessages);
    }
  }

  async function readLogs(pageNumber: number, data) {
    logd(`Triggered readLogs: ${pageNumber}`);
    pageNumber = parseInt(pageNumber.toString());
    const lines = rawLogData
      .getLogs()
      .split("\n")
      .slice(-50 * pageNumber)
      .join("\n");
    logd(`Triggered readLogs - Posting result: ${lines.length}`);
    await postToolCallResult(data, lines, setChatResponseMessages);
    logd(`Triggered readLogs - done Posting result`);
  }

  async function tailLogs(n: number, data) {
    try {
      logd(`Triggered tailLogs: ${n}`);
      n = parseInt(n.toString());
      if (Number.isNaN(n) || n <= 0) {
        await postToolCallResult(
          data,
          "Invalid value for n. Please provide a positive number of log lines to fetch.",
          setChatResponseMessages
        );
        return;
      }
      const tail = rawLogData.getTailLogs(n);

      logd(`Triggered tailLogs - Posting result: ${tail.length}`);
      await postToolCallResult(data, tail, setChatResponseMessages);
      logd(`Triggered tailLogs - done Posting result`);
    } catch (error) {
      logd(`Triggered tailLogs - error: ${JSON.stringify(error)}`);
      await postToolCallResult(
        data,
        "Failed to fetch tail logs from CLI.",
        setChatResponseMessages
      );
    }
  }

  async function grepLogs(
    pattern: string,
    before: number | undefined,
    after: number | undefined,
    data: any
  ) {
    try {
      logd(
        `Triggered grepLogs: pattern=${pattern}, before=${before}, after=${after}`
      );

      if (!pattern || !pattern.trim()) {
        await postToolCallResult(
          data,
          "Invalid pattern for grep_logs. Please provide a non-empty pattern.",
          setChatResponseMessages
        );
        return;
      }

      const beforeCount =
        before !== undefined ? parseInt(before.toString()) : 5;
      const afterCount = after !== undefined ? parseInt(after.toString()) : 5;

      const result = rawLogData.getGrepLogs(pattern, beforeCount, afterCount);
      await postToolCallResult(data, result, setChatResponseMessages);
      logd(
        `Triggered grepLogs - done Posting result of length ${result.length}`
      );
    } catch (error) {
      logd(`Triggered grepLogs - error: ${JSON.stringify(error)}`);
      await postToolCallResult(
        data,
        "Failed to search logs with grep_logs.",
        setChatResponseMessages
      );
    }
  }

  async function getRecentErrors(n: number, data: any) {
    try {
      logd(`Triggered getRecentErrors: n=${n}`);
      n = parseInt(n.toString());
      if (Number.isNaN(n) || n <= 0) {
        await postToolCallResult(
          data,
          "Invalid value for n. Number Provided :" + n.toString(),
          setChatResponseMessages
        );
        return;
      }

      const result = rawLogData.getRecentErrors(n);
      await postToolCallResult(data, result, setChatResponseMessages);
      logd(
        `Triggered getRecentErrors - done Posting result of length ${result.length}`
      );
    } catch (error) {
      logd(`Triggered getRecentErrors - error: ${JSON.stringify(error)}`);
      await postToolCallResult(
        data,
        "Failed to fetch recent error logs.",
        setChatResponseMessages
      );
    }
  }

  async function postToolCallResult(
    data: any,
    result: any,
    setChatResponseMessages
  ) {
    try {
      await toolFunctionCall(
        data?.tool_call_id,
        result,
        data?.args,
        "tool_function_call"
      );
    } catch (error) {
      logd(`Triggered readLogs - failer podting: ${JSON.stringify(error)}`);
      // setChatResponseMessages((prev) => [
      //   ...prev,
      //   error?.response?.message || "Error, please try again",
      // ]);
    }
  }

  async function denyToolAccess(functionName: string, data: any) {
    const serviceId = getServiceId();
    const message = `No Access to execute ${functionName}. with the serviceId of ${
      serviceId ?? "unknown"
    }.`;
    await postToolCallResult(data, message, setChatResponseMessages);
  }

  return {
    connectWebSocket,
    socketId,
    sendQuery,
    chatResponseMessages: chatResponseMessages, // Full history including ToolMessage (needed for backend)
    visibleChats: visibleChats, // Filtered for UI display (excludes ToolMessage except reflections)
    setVisibleChats: setVisibleChats,
    setChatResponseMessages,
    setTrimmedChats,
    isConnected,
    connectionError,
    isLoading,
    setSocketId,
    setIsConnected,
    socket: socketRef.current,
    setIsLoading,
    setShowControlR,
    showControlR,
    setCompleteChatHistory: setChatResponseMessages,
    customMessage,
    graphState,
    setGraphState,
  };
}
