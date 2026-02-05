import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import OutputLayout from "../OutputLayout.js";
import HorizontalLine from "../HorizontalLine.js";
import InProcessLayout from "../InProcessLayout.js";
import { useServicesCollapse } from "../../hooks/useExpandService.js";
import { useConnections } from "../../context/ConnectionsContext.js";
import { useTerminalColumns } from "../../hooks/useTerminalColumns.js";

const RuntimeOutput: React.FC = () => {
  const width = useTerminalColumns();
  const [ctrlPressed, setCtrlPressed] = useState(false);

  const { activeConnections, connectionsLine } = useConnections();
  const { canCollapse, isCollapsed, toggle, visibleCount, totalCount } =
    useServicesCollapse();

  useInput((inputString: string, key) => {
    setCtrlPressed(!!key.ctrl);
    if (key.ctrl && inputString === "c") process.exit();
    if (key.ctrl && inputString === "e") toggle();
  });

  return (
    <OutputLayout>
      <HorizontalLine width={width + 2} color="#EDEDED" />
      <InProcessLayout
        width={width}
        alignItems="flex-start"
        sideText={[
          "You can connect multiple",
          "services to debug them together.",
        ]}
        subTitle=""
        token={1230}
        bgColor="#2F5BFF"
        isDisabled={true}
        ctrlPressed={ctrlPressed}
      >
        <Box flexDirection="column">
          <Text bold>
            <Text>⚡ </Text>
            Monitored Processes ({activeConnections.length} active)
          </Text>
          <Text>
            {isCollapsed
              ? connectionsLine.split("\n").slice(0, visibleCount).join("\n")
              : connectionsLine}
          </Text>

          {canCollapse && isCollapsed && (
            <Text>{totalCount - visibleCount} more (Ctrl + E to expand)</Text>
          )}
        </Box>
      </InProcessLayout>
    </OutputLayout>
  );
};

export default RuntimeOutput;
