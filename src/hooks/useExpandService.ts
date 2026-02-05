import { useState } from "react";
import { useConnections } from "../context/ConnectionsContext.js";

export const MIN_SERVICES_DISPLAYED = 2;

export const useServicesCollapse = () => {
  const { activeConnections } = useConnections();

  const [isCollapsed, setIsCollapsed] = useState(true);

  const canCollapse = activeConnections.length > MIN_SERVICES_DISPLAYED;

  const toggle = () => {
    if (!canCollapse) return;
    setIsCollapsed((v) => !v);
  };

  return {
    canCollapse,
    isCollapsed,
    toggle,
    visibleCount: MIN_SERVICES_DISPLAYED,
    totalCount: activeConnections.length,
  };
};
