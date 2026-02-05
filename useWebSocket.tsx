import { useCallback, useEffect, useRef, useState } from "react";
import WebSocket from "ws";
import { getContextLines } from "./utils.js";
import { fetchLogsFromCluster } from "./src/utils/utils.js";
import {
  type CoreMessage,
  groupMessageChunks,
  extractMessageContent,
  cleanMessagesContent,
  getAssistantDisplayContent,
} from "./coreMessages.js";
import { config } from "./config.js";
import { toolFunctionCall } from "./api.js";
import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { ripgrepSearch } from "./helpers/ripgrep-tool.js";
import { loadProjectMetadata, logd } from "./helpers/cli-helpers.js";
import { LogsManager } from "./logsManager.js";


const HOME_DIR = os.homedir();
const OPENBUG_DIR = path.join(HOME_DIR, ".openbug");
const CONFIG_PATH = path.join(OPENBUG_DIR, "config");
let API_KEY = "";
try {
  const configText = fs.readFileSync(CONFIG_PATH, "utf8");
  const match = configText.match(/^API_KEY\s*=\s*(.*)$/m);
  if (match && match[1]) {
    API_KEY = match[1].trim();
  } else {
    logd("No API_KEY found in ~/.openbug/config");
  }
} catch (err) {
  logd(
    "Failed to read OpenBug config: " +
      (err instanceof Error ? err.message : String(err))
  );
}

const IS_LOCAL_ENV =
  config.api_base_url.includes("localhost") ||
  config.api_base_url.includes("127.0.0.1") ||
  config.websocket_url.includes("localhost") ||
  config.websocket_url.includes("127.0.0.1");

function buildConnectionErrorMessage(base: string): string {
  if (IS_LOCAL_ENV) {
    return (
      base +
      "\n\nCould not reach your local OpenBug agent. " +
      "Make sure `debug <command>` is running for this service and that your CLUSTER_URL / WEB_SOCKET_URL settings are correct."
    );
  }

  return (
    base +
    "\n\nCould not reach the OpenBug cloud. " +
    "Please check your connection, VPN / firewall settings, and try again."
  );
}
export function useWebSocket(
  url: string,
  rawLogData: LogsManager,
  overrideMetadata?: any
) {
  // Reconnect: max 1000 retries, 1s interval; reset to 0 on successful connection
  const MAX_RETRIES = 1000;
  const RETRY_INTERVAL_MS = 1000;
  const retryCountRef = useRef<number>(0);
  const isIntentionalCloseRef = useRef<boolean>(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectScheduledRef = useRef<boolean>(false);

  //refs
  const socketRef = useRef<WebSocket | null>(null);
  const summarizeInProgressRef = useRef<boolean>(false);
  const graphStateRef = useRef<any>(null);
  const latestGraphStateRef = useRef<any>(null);
  const overrideMetadataRef = useRef<any>(overrideMetadata);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [chatResponseMessages, setChatResponseMessages] = useState<CoreMessage[]>([]);
  const [trimmedChats, setTrimmedChats] = useState<CoreMessage[]>([]);
  const initialAssistantMessage: CoreMessage = {
    role: "assistant",
    content:
      "I'm watching your app run locally. You can ask me about errors, logs, performance,or anything else related to this run.",
  };
  const [isConnected, setIsConnected] = useState(false);
  const [visibleChats, setVisibleChats] = useState<CoreMessage[]>([
    initialAssistantMessage,
  ]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showControlR, setShowControlR] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);

  /** graphState.messages is CoreMessage[] (native AI SDK); logs/architecture for next request. */
  const [graphState, setGraphState] = useState<{
    messages: CoreMessage[];
    logs?: string;
    architecture?: string;
    planningDoc?: string;
  } | null>(null);

  const messagesSentRef = useRef<CoreMessage[]>([]);
  const lastLogsRef = useRef<string>("");
  const lastArchitectureRef = useRef<string>("");
  const streamTextRef = useRef<string>("");
  const streamToolCallsRef = useRef<Array<{ toolCallId: string; toolName: string; args: unknown }>>([]);

  const authKey = API_KEY;
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

  useEffect(() => {
    if (!IS_LOCAL_ENV && API_KEY === "") {
      setConnectionError("No API_KEY found in ~/.openbug/config");
      logd("No API_KEY found in ~/.openbug/config");
      // process.exit();
    }
  }, [API_KEY]);

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
            authKey: authKey,
            graphState: currentGraphState,
          }
        );

        if (response.data && response.data.success && response.data.summary) {
          const summaryText = response.data.summary;
          const summaryMessage: CoreMessage = {
            role: "assistant",
            content: `Current Approach Summary:\n${summaryText}`,
          };

          setVisibleChats((old) => [...old, summaryMessage]);
          setTrimmedChats((old) => [...old, summaryMessage]);
          setChatResponseMessages((old) => [...old, summaryMessage]);
          setGraphState((prev) =>
            prev
              ? { ...prev, messages: [...prev.messages, summaryMessage] }
              : prev
          );
        } else {
          throw new Error("Invalid response from summarize API");
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logd(`[summarize] ❌ Error calling summarize API: ${errMsg}`);

        const errorMessage: CoreMessage = {
          role: "assistant",
          content:
            "Something went wrong. Please try asking the question again." +
            errMsg,
        };
        setVisibleChats((old) => [...old, errorMessage]);
        setTrimmedChats((old) => [...old, errorMessage]);
        setChatResponseMessages((old) => [...old, errorMessage]);
        setGraphState((prev) =>
          prev
            ? { ...prev, messages: [...prev.messages, errorMessage] }
            : prev
        );
      } finally {
        summarizeInProgressRef.current = false;
      }
    },
    [authKey]
  );

  //web socket connection
  const connectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isIntentionalCloseRef.current = false;
    reconnectScheduledRef.current = false;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const socket = new WebSocket(url);
    socketRef.current = socket;
    setConnectionError(null);
    setIsConnected(false);

    socket.onopen = () => {
      try {
        const md = getProjectMetadata();
        if (!md?.window_id) {
          setConnectionError(
            "Missing serviceId (window_id). Please ensure a service is registered with the cluster."
          );
          logd("[connectWebSocket] Missing serviceId (window_id). Metadata: " + JSON.stringify(md));
          return;
        }
        socket.send(
          JSON.stringify({
            type: "recurring_connection",
            authKey,
            serviceId: md.window_id,
          })
        );
      } catch (error) {
        logd("[connectWebSocket] Error in socket.onopen: " + (error instanceof Error ? error.message : String(error)));
        setConnectionError("error");
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
          retryCountRef.current = 0;
          setIsConnected(true);
          setSocketId(data.socketId);
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
              }, args=${JSON.stringify(data.args)}`,
            );

            if (!hasCodeAccess()) {
              logd(`[read_file] ⚠️  No code access, denying tool`);
              await denyToolAccess("read_file", data);
              return;
            }

            const projectPath = getProjectMetadata()?.path || process.cwd();
            const rawFilePath = data.args.filePath;
            const resolvedFilePath = path.isAbsolute(rawFilePath)
              ? rawFilePath
              : path.resolve(projectPath, rawFilePath);

            const argsData = {
              filePath: resolvedFilePath,
              lineNumber: data.args.lineNumber,
              before: data.args.before || 30,
              after: data.args.after || 30,
            };

            logd(
              `[read_file] 📋 Extracted args: filePath=${rawFilePath}, resolvedPath=${resolvedFilePath}, projectPath=${projectPath}, processCwd=${process.cwd()}, lineNumber=${argsData.lineNumber}, before=${argsData.before}, after=${argsData.after}`
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
              }`,
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

        // AI SDK stream: accumulate parts, show streaming text as it arrives, finalize on finish
        if (data.type === "response" && data.data?.stream === "ai-sdk") {
          const partType = data.data.partType as string;
          const textChunk = data.data.text ?? data.data.textDelta;
          if (partType === "text-delta" && typeof textChunk === "string") {
            streamTextRef.current += textChunk;
            const partialList: CoreMessage[] = [
              ...messagesSentRef.current,
              { role: "assistant", content: streamTextRef.current },
            ];
            setVisibleChats(partialList);
            setChatResponseMessages(partialList);
            setTrimmedChats(partialList);
          } else if (partType === "text" && typeof textChunk === "string") {
            streamTextRef.current = textChunk;
            const partialList: CoreMessage[] = [
              ...messagesSentRef.current,
              { role: "assistant", content: streamTextRef.current },
            ];
            setVisibleChats(partialList);
            setChatResponseMessages(partialList);
            setTrimmedChats(partialList);
          } else if (partType === "tool-call") {
            streamToolCallsRef.current.push({
              toolCallId: String(data.data.toolCallId ?? ""),
              toolName: String(data.data.toolName ?? ""),
              args: data.data.args,
            });
          } else if (partType === "finish") {
            // Finalize on "finish" (end of full response).
            const text = streamTextRef.current;
            const toolCalls = streamToolCallsRef.current;
            logd(`[stream] Received finish, text length=${text.length}, toolCalls=${toolCalls.length}`);
            const newAssistant: CoreMessage = {
              role: "assistant",
              content:
                toolCalls.length > 0
                  ? [
                      ...(text
                        ? [{ type: "text" as const, text }]
                        : []),
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
            setChatResponseMessages(fullList);
            setTrimmedChats(fullList);
            setGraphState({
              messages: fullList,
              logs: lastLogsRef.current ?? "",
              architecture: lastArchitectureRef.current ?? "",
            });
            latestGraphStateRef.current = {
              messages: fullList,
              logs: lastLogsRef.current ?? "",
              architecture: lastArchitectureRef.current ?? "",
            };
            setIsLoading(false);
            setCustomMessage(null);
            streamTextRef.current = "";
            streamToolCallsRef.current = [];
          } else if (partType === "error") {
            const errorMsg = typeof data.data?.error === "string" ? data.data.error : "Unknown error from model";
            logd(`[stream] Received error part: ${errorMsg}`);
            setIsLoading(false);
            setCustomMessage(null);
            streamTextRef.current = "";
            streamToolCallsRef.current = [];
            const errorAssistant: CoreMessage = {
              role: "assistant",
              content: `Something went wrong: ${errorMsg}`,
            };
            const fullList = [...messagesSentRef.current, errorAssistant];
            setVisibleChats(fullList);
            setChatResponseMessages(fullList);
            setTrimmedChats(fullList);
            setConnectionError(errorMsg);
          }
          return;
        }
        if (data.type === "error") {
          setIsLoading(false);
          setCustomMessage(null);
          const errorMessage = typeof data.message === "string" ? data.message : "Request failed";
          setConnectionError(errorMessage);

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

    const scheduleReconnect = () => {
      if (isIntentionalCloseRef.current) return;
      if (reconnectScheduledRef.current) return;
      if (retryCountRef.current >= MAX_RETRIES) {
        logd("[WebSocket] Max retries reached, not reconnecting.");
        setConnectionError(
          buildConnectionErrorMessage(
            "Connection timed out. Max reconnection attempts reached. Try reconnecting manually (e.g. Ctrl+R)."
          )
        );
        return;
      }
      reconnectScheduledRef.current = true;
      retryCountRef.current += 1;
      const attempt = retryCountRef.current;
      logd(
        `[WebSocket] Reconnecting in ${RETRY_INTERVAL_MS}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      // Visible in terminal when testing reconnect
      console.log(
        `\n[OpenBug] Reconnecting in ${RETRY_INTERVAL_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES})…\n`
      );
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket();
      }, RETRY_INTERVAL_MS);
    };

    socket.onerror = (error) => {
      logd("[WebSocket] connection error: " + (error?.message ?? String(error)));
      setConnectionError(
        buildConnectionErrorMessage("WebSocket connection error, reconnecting…")
      );
      setIsConnected(false);
      setIsLoading(false);
      socketRef.current = null;
      scheduleReconnect();
    };

    socket.onclose = () => {
      setConnectionError(
        buildConnectionErrorMessage("Connection closed. Reconnecting…")
      );
      setIsConnected(false);
      setIsLoading(false);
      socketRef.current = null;
      scheduleReconnect();
    };
  }, [url, authKey, callSummarizeAPI]);

  const sendQuery = useCallback(
    (
      messages: CoreMessage[],
      architecture: string,
      logs?: string,
      planningDoc?: string
    ) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        setIsLoading(true);
        lastLogsRef.current = logs ?? "";
        lastArchitectureRef.current = architecture;
        streamTextRef.current = "";
        streamToolCallsRef.current = [];
        setCustomMessage("🤔 Thinking...");
        const md = getProjectMetadata();
        const userQueryMessages = graphState
          ? [messages[messages.length - 1]]
          : messages;
        messagesSentRef.current = graphState
          ? [...graphState.messages, messages[messages.length - 1]]
          : messages;
        const payload = {
          type: "query",
          authKey,
          serviceId: md?.window_id,
          userQuery: {
            messages: userQueryMessages,
            architecture,
            logs: logs ?? "",
            planningDoc: "",
          },
          planningDoc: planningDoc ?? "",
          graphState: graphState
            ? {
                messages: graphState.messages,
                logs: graphState.logs,
                architecture: graphState.architecture,
                planningDoc: graphState.planningDoc,
              }
            : undefined,
        };
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

  const interrupt = useCallback(() => {
    isIntentionalCloseRef.current = true;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.close();
      } catch {
      }
    }
    socketRef.current = null;
    setIsLoading(false);
    setCustomMessage(null);
  }, []);

  useEffect(() => {
    return () => {
      isIntentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          // ignore
        }
        socketRef.current = null;
      }
    };
  }, []);

  async function grepSearch(searchTerm: string, data) {
    logd(
      `[grepSearch] 🔍 Grep search invoked: searchTerm=${searchTerm}, tool_call_id=${
        data.tool_call_id
      }, args=${JSON.stringify(data.args)}`,
    );
    const projectMetadata = getProjectMetadata();
    const workingDirectory = projectMetadata?.path || process.cwd();

    logd(
      `[grepSearch] 📁 Working directory: workingDirectory=${workingDirectory}, projectPath=${
        projectMetadata?.path || "N/A"
      }, processCwd=${process.cwd()}`,
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
          })),
        )}`,
      );

      await postToolCallResult(data, results, setChatResponseMessages);
    } catch (error) {
      logd(
        `[grepSearch] ❌ Error during grep search: ${
          error instanceof Error ? error.message : String(error)
        }, stack=${error instanceof Error ? error.stack : "N/A"}`,
      );
      await postToolCallResult(data, [], setChatResponseMessages);
    }
  }

  async function readLogs(pageNumber: number, data) {
    logd(`Triggered readLogs: ${pageNumber}`);
    pageNumber = parseInt(pageNumber.toString());
    let logs = rawLogData.getLogs() || "";
    if (!logs.trim()) {
      const windowId = getProjectMetadata()?.window_id;
      if (windowId) {
        logd(`[readLogs] Local logs empty, fetching from cluster for window_id=${windowId}`);
        logs = (await fetchLogsFromCluster(windowId)) || "";
      }
    }
    const lines = logs
      .split("\n")
      .slice(-50 * pageNumber)
      .join("\n");
    logd(`Triggered readLogs - Posting result: ${lines.length}`);
    await postToolCallResult(data, lines || "No log lines available.", setChatResponseMessages);
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
      let logs = rawLogData.getLogs() || "";
      if (!logs.trim()) {
        const windowId = getProjectMetadata()?.window_id;
        if (windowId) {
          logd(`[tailLogs] Local logs empty, fetching from cluster for window_id=${windowId}`);
          logs = (await fetchLogsFromCluster(windowId)) || "";
          logd(`[tailLogs] Cluster logs length: ${logs.length}`);
        }
      }
      const linesArr = logs.split("\n");
      const tail = linesArr.slice(-n).join("\n");

      logd(`Triggered tailLogs - Posting result: ${tail.length} chars (${linesArr.length} total lines)`);
      await postToolCallResult(data, tail || "No log lines available.", setChatResponseMessages);
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

      let logs = rawLogData.getLogs() || "";
      if (!logs.trim()) {
        const windowId = getProjectMetadata()?.window_id;
        if (windowId) {
          logd(`[grepLogs] Local logs empty, fetching from cluster for window_id=${windowId}`);
          logs = (await fetchLogsFromCluster(windowId)) || "";
        }
      }
      const result = logs
        ? (() => {
            const lines = logs.split("\n");
            const normalizedPattern = pattern.toLowerCase();
            const blocks: string[] = [];
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(normalizedPattern)) {
                const start = Math.max(0, i - beforeCount);
                const end = Math.min(lines.length, i + afterCount + 1);
                blocks.push(`block (match line ${i + 1}): ${lines.slice(start, end).join("\n")}`);
              }
            }
            return blocks.length === 0 ? `No matches found for pattern "${pattern}" in logs.` : blocks.join("\n\n");
          })()
        : "No log lines available.";
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
      let logs = rawLogData.getLogs() || "";
      if (!logs.trim()) {
        const windowId = getProjectMetadata()?.window_id;
        if (windowId) {
          logd(`[getRecentErrors] Local logs empty, fetching from cluster for window_id=${windowId}`);
          logs = (await fetchLogsFromCluster(windowId)) || "";
        }
      }
      const result = logs
        ? (() => {
            const lines = logs.split("\n");
            const errorRegex = /\b(ERROR|ERR|FATAL|CRITICAL|WARN|WARNING|SEVERE|ALERT|PANIC|EMERGENCY)\b|(Exception|Unhandled|Uncaught|Traceback|stacktrace|Caused by:)|(TypeError|ReferenceError|RangeError|SyntaxError|RuntimeError|ValueError|NullPointerException|IllegalArgument)|(timeout|timed out|connection refused|connection reset|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN)|(HTTP\s(4\d\d|5\d\d)|\b5\d\d\b|\b429\b|\b503\b)|(OOM|out of memory|disk full|quota exceeded|rate limited|deadlock|segfault|SIGKILL|panic|crashed|crash)/i;
            const matched: string[] = [];
            for (let i = lines.length - 1; i >= 0 && matched.length < n; i--) {
              if (errorRegex.test(lines[i])) matched.push(lines[i]);
            }
            return matched.length === 0 ? "No recent error log lines found" : matched.reverse().join("\n");
          })()
        : "No log lines available.";
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
    data: { tool_call_id?: string; function_name?: string; args?: unknown },
    result: unknown,
    setChatResponseMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>
  ) {
    try {
      await toolFunctionCall(
        data?.tool_call_id,
        result,
        data?.args,
        "tool_function_call"
      );
      const functionName = data?.function_name ?? "tool";
      const toolCallId = data?.tool_call_id ?? `tool-${Date.now()}`;
      const completionMessage: CoreMessage = {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId,
            toolName: functionName,
            result: `✓ Tool \`${functionName}\` completed.`,
          },
        ],
      };
      setChatResponseMessages((prev) => [...prev, completionMessage]);
      setVisibleChats((prev) => [...prev, completionMessage]);
      setTrimmedChats((prev) => [...prev, completionMessage]);
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
    API_KEY,
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
    interrupt,
  };
}
