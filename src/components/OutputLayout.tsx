import QuestionTag from "./QuestionTag.js";
import Loader from "./Loader.js";
import { useManageState } from "../context/context.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, useStdout, Box, useInput } from "ink";
import { useWebSocket } from "../../useWebSocket.js";
import { config } from "../../config.js";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { useConnections } from "../context/ConnectionsContext.js";
import { useCluster } from "../hooks/useCluster.js";
import { useChatSubmit } from "../hooks/useHandleSubmit.js";
import logsManager from "../../logsManager.js";
import { useChatLines } from "../hooks/useChatLines.js";
import stripAnsi from "strip-ansi";

//marked
marked.use(
  markedTerminal({
    reflowText: false,
    showSectionPrefix: false,
    unescape: true,
    emoji: true,
  }),
);

//text animation
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

const OutputLayout = ({ children }) => {
  const { stdout } = useStdout();
  const { setValue } = useManageState();
  const { activeConnections, setActiveConnections } = useConnections();
  const [terminalCols, setTerminalCols] = useState<number>(
    stdout?.columns || 80,
  );
  const [showFullChat, setShowFullChat] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState<number | null>(null);
  const [ctrlPressed, setCtrlPressed] = useState(false);

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

  //web socket connection
  const {
    connectWebSocket,
    visibleChats,
    setVisibleChats,
    sendQuery,
    connectionError,
    isLoading,
    customMessage,
    chatResponseMessages,
    setChatResponseMessages,
    setTrimmedChats,
    setShowControlR,
    setGraphState,
    setIsLoading,
    interrupt,
  } = useWebSocket(config.websocket_url, logsManager, projectMetadata);

  useCluster();

  const handleSubmit = useChatSubmit({
    activeProject,
    activeConnections,
    visibleChats,
    setVisibleChats,
    setChatResponseMessages,
    setTrimmedChats,
    sendQuery,
    setValue,
    isLoading,
  });

  const messagesToRender = showFullChat ? chatResponseMessages : visibleChats;

  const { lines: chatLines, toolStatus } = useChatLines({
    messages: messagesToRender,
    terminalCols,
  });

  useInput((inputStr: string, key: any) => {
    setCtrlPressed(!!key.ctrl);

    if (key.ctrl && inputStr === "o") {
      setShowFullChat((prev) => !prev);
      return;
    }

    if (key.ctrl && inputStr === "r") {
      setShowControlR(false);
      setChatResponseMessages(() => []);
      setTrimmedChats(() => []);
      setVisibleChats((prev) => (prev.length > 0 ? [prev[0]] : prev));
      setGraphState(null);
      setIsLoading(false);
      setValue("");
      return;
    }

    if (key.escape && isLoading) {
      interrupt();
      setThinkingSeconds(null);
      connectWebSocket();
      return;
    }
  });

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isLoading) {
      const start = Date.now();
      setThinkingSeconds(0);

      interval = setInterval(() => {
        const seconds = Math.max(1, Math.round((Date.now() - start) / 1000));
        setThinkingSeconds(seconds);
      }, 1000);
    } else if (!isLoading && thinkingSeconds !== null) {
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  useEffect(() => {
    if (activeProject && activeProject.window_id) {
      const timer = setTimeout(() => {
        connectWebSocket();
      }, 100);
      return () => clearTimeout(timer);
    } else if (activeConnections.length === 0) {
      // console.log(
      //   "No active connections found. Waiting for services to register...",
      // );
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

  return (
    <>
      {chatLines.map((line) => {
        if (line.isHuman) {
          const text = line.text.trim();
          return (
            <QuestionTag
              key={line.key}
              bgColor="#2F5BFF"
              question={stripAnsi(line.text)}
              setValue={() => {
                stripAnsi(line.text);
              }}
              isDisabled={true}
              ctrlPressed={ctrlPressed}
            />
          );
        }

        return <Text key={line.key}>{line.text}</Text>;
      })}

      {isLoading && toolStatus && (
        <Text color="#0BAB00"> ◉ Analyzing {toolStatus}...</Text>
      )}

      {isLoading && <Loader showFullChat={showFullChat} />}

      {thinkingSeconds !== null && !isLoading && (
        <Text color="#707070">
          Thought for {thinkingSeconds}s (Ctrl + O to{" "}
          {showFullChat ? "hide thinking" : "show thinking"})
        </Text>
      )}

      {connectionError && (
        <Text color="red">Connection Error: {connectionError}</Text>
      )}

      <QuestionTag
        bgColor="#2F5BFF"
        question="Say hi or ask about your services…"
        setValue={setValue}
        isDisabled={false}
        handleSubmit={handleSubmit}
        ctrlPressed={ctrlPressed}
      />

      {children}
    </>
  );
};

export default OutputLayout;
