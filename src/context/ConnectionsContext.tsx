import React, { createContext, useContext, useMemo, useState } from "react";

export interface ActiveConnection {
  id: string;
  description?: string;
  name?: string;
  path?: string;
  window_id?: number;
  logs_available?: boolean;
  code_available?: boolean;
}

type ConnectionsContextValue = {
  activeConnections: ActiveConnection[];
  setActiveConnections: React.Dispatch<
    React.SetStateAction<ActiveConnection[]>
  >;
  connectionsLine: string;
};

const ConnectionsContext = createContext<ConnectionsContextValue | undefined>(
  undefined,
);

export const ConnectionsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeConnections, setActiveConnections] = useState<
    ActiveConnection[]
  >([]);

  const connectionsLine = useMemo(() => {
    if (activeConnections.length === 0) {
      return "NO SERVICE CONNECTED";
    }

    return activeConnections
      .map(
        (c, i) =>
          ` └ ${i + 1}. ${c.name || "Unnamed"} (${c.path || "unknown path"})`,
      )
      .join("\n");
  }, [activeConnections]);

  return (
    <ConnectionsContext.Provider
      value={{ activeConnections, setActiveConnections, connectionsLine }}
    >
      {children}
    </ConnectionsContext.Provider>
  );
};

export const useConnections = () => {
  const ctx = useContext(ConnectionsContext);
  if (!ctx) {
    throw new Error("useConnections must be used within ConnectionsProvider");
  }
  return ctx;
};
