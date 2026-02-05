import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useManageState } from "../../context/context.js";
import InProcessLayout from "../InProcessLayout.js";
import ServiceConnected from "./ServiceConnected.js";
import { useConnections } from "../../context/ConnectionsContext.js";
import { useCluster } from "../../hooks/useCluster.js";
import { useWebSocket } from "../../../useWebSocket.js";
import logsManager from "../../../logsManager.js";
import { config } from "../../../config.js";
import RuntimeOutput from "./RuntimeOutput.js";
import { useTerminalColumns } from "../../hooks/useTerminalColumns.js";

const NoService: React.FC = () => {
  const width = useTerminalColumns();
  const [ctrlPressed, setCtrlPressed] = useState(false);

  const { activeConnections, connectionsLine } = useConnections();

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
  const { connectWebSocket } = useWebSocket(
    config.websocket_url,
    logsManager,
    projectMetadata,
  );

  useCluster();

  // Only connect from here when we're showing the "no service" view. When we have
  // connections we render RuntimeOutput -> OutputLayout, which has its own useWebSocket
  // and connectWebSocket. Avoid opening a second socket so query/response stay on the same connection.
  useEffect(() => {
    if (activeConnections.length > 0) return;
    if (activeProject && activeProject.window_id) {
      const timer = setTimeout(() => {
        connectWebSocket();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [connectWebSocket, activeProject, activeConnections.length]);

  // handleConnectService
  // const handleConnectService = () => {
  //   if (activeConnections.length > 0) update({ showRuntimeOutput: true });
  // };

  useInput((inputString: string, key) => {
    // if (key.return) handleConnectService();
    setCtrlPressed(!!key.ctrl);
    if (key.ctrl && inputString === "c") process.exit();
  });

  return (
    <>
      {activeConnections.length === 0 ? (
        <InProcessLayout
          width={width}
          alignItems="flex-start"
          sideText={[
            "You can connect multiple",
            "services to debug them together.",
          ]}
          subTitle="Connect a service to begin…"
          token={1230}
          bgColor="#707070"
          isDisabled={true}
          ctrlPressed={ctrlPressed}
        >
          <Box flexDirection="column">
            <Box flexDirection="column">
              <Text backgroundColor={"#FFE3E3"} color={"#FF0000"}>
                {connectionsLine}
              </Text>
              <Text color={"#707070"}>Tip:</Text>
              <Text color={"#707070"}>You can connect multiple</Text>
              <Text color={"#707070"}>services to debug them together.</Text>
            </Box>
            <Box borderStyle={"single"} flexDirection="column">
              <Text>Example:</Text>
              <Text> $ debug npm run dev</Text>
            </Box>
          </Box>
        </InProcessLayout>
      ) : (
        <RuntimeOutput />
      )}
    </>
  );
};

export default NoService;
