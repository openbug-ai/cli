#!/usr/bin/env tsx

import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useInput, useApp, render, Box, Text, useStdout } from "ink";
import stringWidth from "string-width";
import sliceAnsi from "slice-ansi";
import { spawn as ptySpawn } from "node-pty";
import TextInput from "ink-text-input";
import * as dotenv from "dotenv";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { useWebSocket } from "./useWebSocket.js";
import { config } from "./config.js";
import Spinner from "ink-spinner";
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
} from "langchain";
import { SystemMessage } from "@langchain/core/messages";
import fs from "fs";
import path from "path";
import {
  loadProjectMetadata,
  fetchProjectsFromCluster,
  logd,
  getConfigValue,
} from "./helpers/cli-helpers.js";
import WebSocket from "ws";
import logsManager from "./logsManager.js";
import { extractMessageContent } from "./utils.js";

const initialAssistantMessage = new SystemMessage(
  "I'm watching your app run locally. You can ask me about errors, logs, performance,or anything else related to this run."
);

dotenv.config({ quiet: true });

if (typeof process !== "undefined" && process.on) {
  process.on("SIGINT", () => {
    console.log("\nCtrl+C detected! Exiting...");
    process.exit();
  });
}
interface BorderBoxProps {
  title: string;
  children: React.ReactNode;
}
interface ShortcutDefinition {
  shortcut: string;
  description: string;
}
//progress event type props
interface ProgressMessage {
  id?: string[];
  kwargs?: { content?: string };
}
interface ProgressData {
  messages?: ProgressMessage[];
}
interface ProgressObject {
  type: string;
  data?: ProgressData;
}
interface ContentLine {
  key: string;
  text: string;
}
interface ScrollableContentProps {
  lines: ContentLine[];
  maxHeight: number;
  isFocused: boolean;
  onScrollChange: (newOffset: number) => void;
  scrollOffset: number;
  availableWidth: number;
}
interface ScrollableContentChatProps {
  lines: any[];
  maxHeight: number;
  isFocused: boolean;
  onScrollChange: (newOffset: number) => void;
  scrollOffset: number;
  isLoading: boolean;
  showControlR: boolean;
  customMessage?: string | null;
}
interface BorderBoxProps {
  title: string;
  children: React.ReactNode;
  isFocused: boolean;
  width: string;
}

//type for modes
type Mode = "NORMAL" | "COPY" | "LOGS";

marked.use(
  markedTerminal({
    reflowText: false,
    showSectionPrefix: false,
    unescape: true,
    emoji: true,
  })
);
const COLON_REPLACER = "*#COLON|*";
function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}
const COLON_REPLACER_REGEXP = new RegExp(escapeRegExp(COLON_REPLACER), "g");
function undoColon(str) {
  return str.replace(COLON_REPLACER_REGEXP, ":");
}
// Override just the 'text' renderer to handle inline tokens:
marked.use({
  renderer: {
    text(tokenOrString: any) {
      if (typeof tokenOrString === "object" && tokenOrString?.tokens) {
        // @ts-ignore - 'this' is the renderer context with a parser
        return undoColon(this.parser.parseInline(tokenOrString.tokens));
      }
      return typeof tokenOrString === "string"
        ? tokenOrString
        : tokenOrString?.text ?? "";
    },
  },
});
//get last 50 lines of logs
function getLast50Lines(str: string): string {
  const lines = str.split("\n");
  return lines.slice(-50).join("\n");
}
// Helper function to wrap text to a specific width, accounting for ANSI codes
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
      // If a single word is too long, it will overflow - keep it as one line
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

//truncate the line depending on the width available
function getProcessedLine(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return text;

  const expanded = text.replace(/\t/g, " ".repeat(8));
  const width = stringWidth(expanded);

  if (width > maxWidth && maxWidth > 3) {
    return sliceAnsi(expanded, 0, Math.max(0, maxWidth - 3)) + "...";
  }

  return expanded;
}


//border for the content
const BorderBox: React.FC<BorderBoxProps> = ({
  title,
  children,
  isFocused,
  width,
}) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={isFocused ? "greenBright" : "gray"}
    paddingX={1}
    paddingY={0}
    marginRight={1}
    width={width}
    overflow="hidden"
  >
    <Box
      marginBottom={1}
      borderBottom={isFocused ? true : undefined}
      borderBottomColor={isFocused ? "greenBright" : "gray"}
    >
      <Text color="cyan" bold={isFocused}>
        {title} {isFocused ? " (FOCUSED)" : ""}
      </Text>
    </Box>
    {children}
  </Box>
);

const BorderBoxNoBorder: React.FC<BorderBoxProps> = ({
  title,
  children,
  isFocused,
  width,
}) => (
  <Box
    flexDirection="column"
    borderColor={isFocused ? "greenBright" : "gray"}
    paddingX={1}
    paddingY={0}
    marginRight={1}
    width={width}
    overflow="hidden"
  >
    <Box
      marginBottom={1}
      borderBottom={isFocused ? true : undefined}
      borderBottomColor={isFocused ? "greenBright" : "gray"}
    >
      <Text color="cyan" bold={isFocused}>
        {title} {isFocused ? " (FOCUSED)" : ""}
      </Text>
    </Box>
    {children}
  </Box>
);

const ShortcutBadge: React.FC<{ label: string }> = ({ label }) => (
  <Text backgroundColor="#1f2937" color="#f8fafc" bold>
    {" "}
    {label}{" "}
  </Text>
);

const ShortcutItem: React.FC<ShortcutDefinition & { showDivider: boolean }> = ({
  shortcut,
  description,
  showDivider,
}) => (
  <Box alignItems="center" marginBottom={0} marginX={1}>
    {showDivider && (
      <Text color="#4b5563" dimColor>
        │{" "}
      </Text>
    )}
    <ShortcutBadge label={shortcut} />
    <Text color="#b0b0b0">{` ${description}`}</Text>
  </Box>
);

const ShortcutsFooter: React.FC<{ shortcuts: ShortcutDefinition[] }> = ({
  shortcuts,
}) => {
  const firstRow = shortcuts.slice(0, 3);
  const secondRow = shortcuts.slice(3);

  return (
    <Box
      marginTop={1}
      width="100%"
      flexDirection="column"
      alignItems="center"
      paddingX={1}
    >
      <Text color="#2d3748">──────────────────────────────────</Text>
      <Box flexDirection="column" marginTop={0}>
        {[firstRow, secondRow]
          .filter((row) => row.length > 0)
          .map((row, rowIndex) => (
            <Box
              key={`shortcut-row-${rowIndex}`}
              flexDirection="row"
              justifyContent="center"
              marginTop={rowIndex === 0 ? 0 : 1}
            >
              {row.map((item, index) => (
                <ShortcutItem
                  key={`${item.shortcut}-${item.description}`}
                  shortcut={item.shortcut}
                  description={item.description}
                  showDivider={index !== 0}
                />
              ))}
            </Box>
          ))}
      </Box>
    </Box>
  );
};

const getShortcutsForMode = (mode: Mode): ShortcutDefinition[] => {
  const ctrlDAction =
    mode === "COPY"
      ? "Expand Logs"
      : mode === "LOGS"
      ? "Collapse Logs"
      : "Toggle chat";

  return [
    { shortcut: "[Tab]", description: "Switch Focus" },
    { shortcut: "[ ⬆ / ⬇ ]", description: "Scroll (Keyboard Only)" },
    { shortcut: "[Enter]", description: "Send" },
    { shortcut: "[Ctrl+D]", description: ctrlDAction },
    { shortcut: "[Ctrl+C]", description: "Exit" },
    // { shortcut: "[Ctrl+R]", description: "Reload AI chat" },
  ];
};

export const App: React.FC = () => {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const [rawLogData, setRawLogData] = useState<ContentLine[]>([]);
  const partialLine = useRef("");
  const logKeyCounter = useRef(0);

  //auto truncate logs depending on width
  const ptyRef = useRef<any>(null);
  const ptyAliveRef = useRef(false);

  const [terminalRows, setTerminalRows] = useState<number>(stdout?.rows || 20);
  const [terminalCols, setTerminalCols] = useState<number>(
    stdout?.columns || 80
  );
  const [unTamperedLogs, setUnTamperedLogs] = useState<string>("");

  // refs for current dims (used by stable callbacks)
  const terminalColsRef = useRef<number>(terminalCols);
  const terminalRowsRef = useRef<number>(terminalRows);
  
  // Cluster server connection for log streaming
  const clusterSocketRef = useRef<WebSocket | null>(null);
  const projectMetadataRef = useRef<any>(null);

  useEffect(() => {
    terminalColsRef.current = terminalCols;
  }, [terminalCols]);
  useEffect(() => {
    terminalRowsRef.current = terminalRows;
  }, [terminalRows]);

  //websocket hook - keep connection active in background for log streaming
  const {
    connectWebSocket,
    // All WebSocket functionality retained but not used in UI
  } = useWebSocket(config.websocket_url, logsManager);

  useEffect(() => {
    const handleResize = () => {
      if (stdout?.rows) setTerminalRows(stdout.rows);
      if (stdout?.columns) setTerminalCols(stdout.columns);

      // Use full terminal width for native terminal experience
      const cols = Math.max(10, stdout?.columns || 80);
      const rows = Math.max(1, stdout?.rows || 20);

      if (ptyAliveRef.current && ptyRef.current) {
        try {
          ptyRef.current.resize(cols, rows);
        } catch {
          //ignore
        }
      }
    };

    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, [stdout]);

  //web socket connection
  useEffect(() => {
    connectWebSocket();
  }, []);

  // Connect to cluster server for log streaming
  useEffect(() => {
    // For oncall <command>, we're already in the project directory
    // So loadProjectMetadata() without arguments uses process.cwd() which is correct
    const metadata = loadProjectMetadata();
    projectMetadataRef.current = metadata;
    
    if (!metadata?.window_id) {
      // console.log(`[Cluster] Cannot connect to cluster server: metadata.window_id is missing. Metadata:`, metadata);
      // console.log(`[Cluster] Current working directory: ${process.cwd()}`);
      return;
    }

    // console.log(`[Cluster] Initializing cluster connection for window_id: ${metadata.window_id}, path: ${metadata.path || process.cwd()}`);

    const clusterUrl = getConfigValue("CLUSTER_URL", "ws://127.0.0.1:4466");
    try {
      const socket = new WebSocket(clusterUrl);
      clusterSocketRef.current = socket;

      socket.onopen = () => {
        // Connection established, logs will be streamed via onData handler
        const metadata = projectMetadataRef.current || loadProjectMetadata();
        // console.log(`[Cluster] ✅ Connected to cluster server for log streaming. window_id: ${metadata?.window_id}, path: ${metadata?.path || process.cwd()}`);
      };

      socket.onerror = (error) => {
        // Cluster server not available, continue without streaming
        console.log(`[Cluster] Error connecting to cluster server: ${error}`);
        clusterSocketRef.current = null;
      };

      socket.onclose = () => {
        clusterSocketRef.current = null;
      };
    } catch (error) {
      // Cluster server not available, continue without streaming
    }

    return () => {
      if (clusterSocketRef.current) {
        clusterSocketRef.current.close();
        clusterSocketRef.current = null;
      }
    };
  }, []);

  //get the AIMessage content inside the progress event
  // let lastAIMessage = "";
  // function extractAIMessages(obj: ProgressObject): string | undefined {
  //   if (obj?.type !== "progress") return undefined;

  //   const messages = (obj.data && obj.data?.messages) ?? [];

  //   const latestAI = [...messages]
  //     .reverse()
  //     .find((m) => m.id?.includes("AIMessage"));

  //   const content = latestAI?.kwargs?.content?.trim();
  //   if (!content) return undefined;

  //   if (content === lastAIMessage) {
  //     return undefined;
  //   }
  //   lastAIMessage = content;
  //   if (content === undefined) return undefined;
  //   return content;
  // }

  // Chat UI removed - logs only view

  // Keep logLines purely tied to stored processed lines
  const logLines: ContentLine[] = useMemo(() => rawLogData, [rawLogData]);

  // Prefer a known-good shell over a potentially broken $SHELL on some machines
  function getSafeShell(): string {
    const candidates = [
      process.env.SHELL, // user-configured shell
      "/bin/zsh",
      "/bin/bash",
    ].filter(Boolean) as string[];

    for (const shell of candidates) {
      try {
        // Synchronously test if the shell is executable by spawning a no-op command.
        // Use child_process directly to avoid triggering node-pty in this probe.
        const { spawnSync } = require("child_process");
        const res = spawnSync(shell, ["-c", "echo"], { stdio: "ignore" });
        if (res.status === 0) {
          return shell;
        }
      } catch {
        // ignore and try next candidate
      }
    }

    // Fallback to a generic bash lookup; node-pty will still error if it's truly missing,
    // but this avoids depending on a bad $SHELL value.
    return "bash";
  }

  // Stable function to run bash command: uses full terminal dimensions
  const runBashCommandWithPipe = useCallback((command: string) => {
    const shell = getSafeShell();
    const cols = Math.max(10, terminalColsRef.current);
    const rows = Math.max(1, terminalRowsRef.current);

    ptyRef.current = ptySpawn(shell, ["-c", command], {
      cwd: process.cwd(),
      env: process.env,
      cols,
      rows,
    });
    ptyAliveRef.current = true;
    const ptyProcess = ptyRef.current;

    ptyProcess.onData((chunk: string) => {
      setUnTamperedLogs((oldLines) => oldLines + chunk);
      logsManager.addChunk(chunk);
      
      // Stream logs to cluster server for global access
      if (clusterSocketRef.current && clusterSocketRef.current.readyState === WebSocket.OPEN) {
        const metadata = projectMetadataRef.current || loadProjectMetadata();
        if (metadata?.window_id) {
          try {
            clusterSocketRef.current.send(
              JSON.stringify({
                type: "stream_logs",
                window_id: metadata.window_id,
                logs: chunk,
              })
            );
            // Log first chunk to verify streaming is working
            if (!(clusterSocketRef.current as any).hasLoggedFirstChunk) {
              // console.log(`[Cluster] ✅ Streaming first log chunk to cluster server. window_id: ${metadata.window_id}, chunk size: ${chunk.length}`);
              (clusterSocketRef.current as any).hasLoggedFirstChunk = true;
            }
          } catch (error) {
            console.log(`[Cluster] ❌ Error streaming logs to cluster server: ${error}`);
          }
        } else {
          console.log(`[Cluster] ⚠️  Cannot stream logs: metadata.window_id is missing. Metadata:`, metadata);
        }
      } else {
        // Log connection issues only once to avoid spam
        if (clusterSocketRef.current && !(clusterSocketRef.current as any).hasLoggedConnectionIssue) {
          console.log(`[Cluster] ⚠️  Cluster socket not ready. State: ${clusterSocketRef.current?.readyState}, OPEN=${WebSocket.OPEN}`);
          (clusterSocketRef.current as any).hasLoggedConnectionIssue = true;
        }
      }
      
      let data = partialLine.current + chunk;
      const lines = data.split("\n");
      partialLine.current = lines.pop() || "";
      if (lines.length > 0) {
        const newLines: ContentLine[] = lines.map((line) => ({
          key: `log-${logKeyCounter.current++}`,
          text: line,
        }));

        // Append in single update
        setRawLogData((prevLines) => [...prevLines, ...newLines]);
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      ptyAliveRef.current = false;
      ptyRef.current = null;
      if (partialLine.current.length > 0) {
        const remainingLine: ContentLine = {
          key: `log-${logKeyCounter.current++}`,
          text: partialLine.current,
        };
        setRawLogData((prevLines) => [...prevLines, remainingLine]);
        partialLine.current = "";
      }
      const exitLine: ContentLine = {
        key: `log-${logKeyCounter.current++}`,
        text: `\n[Process exited with code ${exitCode}]\n`,
      };
      setRawLogData((prevLines) => [...prevLines, exitLine]);
    });

    return () => {
      try {
        ptyProcess.kill();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Start the pty once on mount. Do NOT restart on resize.
  useEffect(() => {
    const cmd =
      process.argv.slice(2).join(" ") ||
      'echo "Welcome to the Scrollable CLI Debugger." && echo "Run a command after the script: tsx cli-app.tsx ls -la" && sleep 0.5 && echo "Fetching logs..." && echo "---------------------------" && ls -la';

    const unsubscribe = runBashCommandWithPipe(cmd);
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (partialLine.current.length > 0) {
        const remainingLine: ContentLine = {
          key: `log-${logKeyCounter.current++}`,
          text: partialLine.current,
        };
        setRawLogData((prev) => [...prev, remainingLine]);
        partialLine.current = "";
      }
    };
  }, [runBashCommandWithPipe]);

  useInput((inputStr: string, key: any) => {
    // Only handle Ctrl+C for exit - let native terminal handle everything else
    if (inputStr === "c" && key.ctrl) {
      exit();
      return;
    }
  });

  // Simple terminal view - just show logs with native terminal scrolling
  return (
    <Box flexDirection="column" width="100%">
      {logLines.map((line) => {
        const rendered = marked.parseInline(line.text);
        return <Text key={line.key}>{rendered}</Text>;
      })}
    </Box>
  );
};

render(<App />);
