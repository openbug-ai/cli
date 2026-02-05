import { render } from "ink";
import { ManageStateProvider } from "./src/context/context.js";
import { ManageStateRenderer } from "./src/components/manageState/ManageStateRenderer.js";
import Logo from "./src/components/Logo.js";
import { ConnectionsProvider } from "./src/context/ConnectionsContext.js";
import { useTerminalColumns } from "./src/hooks/useTerminalColumns.js";

const OpenBug = () => {
  const width = useTerminalColumns();
  return (
    <ConnectionsProvider>
      <ManageStateProvider>
        <Logo width={width + 2} />
        <ManageStateRenderer />
      </ManageStateProvider>
    </ConnectionsProvider>
  );
};

render(<OpenBug />);
