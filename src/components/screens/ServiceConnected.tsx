import { Box, Text, useInput } from "ink";
import InProcessLayout from "../InProcessLayout.js";
import { useServicesCollapse } from "../../hooks/useExpandService.js";
import { useState } from "react";
import { useTerminalColumns } from "../../hooks/useTerminalColumns.js";

type ServiceConnectedProps = {
  connectionsLine: any;
  activeConnections: any;
  handleSubmit: (value: string) => void | Promise<void>;
};

const ServiceConnected: React.FC<ServiceConnectedProps> = ({
  connectionsLine,
  activeConnections,
  handleSubmit,
}) => {
  const width = useTerminalColumns();
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const { canCollapse, isCollapsed, toggle, visibleCount, totalCount } =
    useServicesCollapse();

  useInput((inputString: string, key) => {
    setCtrlPressed(!!key.ctrl);
    if (key.ctrl && inputString === "c") process.exit();
    if (
      key.ctrl &&
      inputString === "e" &&
      activeConnections.length > visibleCount
    )
      toggle();
  });

  return (
    <InProcessLayout
      width={width}
      alignItems="flex-start"
      sideText={[
        "You can connect multiple",
        "services to debug them together.",
      ]}
      subTitle="Say hi or ask about your services…"
      token={1230}
      bgColor="#2F5BFF"
      isDisabled={false}
      handleSubmit={handleSubmit}
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
  );
};

export default ServiceConnected;
