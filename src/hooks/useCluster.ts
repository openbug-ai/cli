import { useEffect, useRef } from "react";
import WebSocket from "ws";
import { useConnections } from "../context/ConnectionsContext.js";

const DEFAULT_CLUSTER_URL =
  process.env.OPENBUG_CLUSTER_URL || "ws://127.0.0.1:4466";

export function useCluster(clusterUrl: string = DEFAULT_CLUSTER_URL) {
  const { setActiveConnections } = useConnections();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    const connect = () => {
      try {
        const socket = new WebSocket(clusterUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          socket.send(
            JSON.stringify({
              type: "subscribe_updates",
              id: "openbug-service",
            }),
          );
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data.toString());
            if (
              (data.type === "project_update" ||
                data.type === "projects" ||
                data.type === "fetch_projects_ack") &&
              Array.isArray(data.projects)
            ) {
              setActiveConnections(data.projects);
            }
          } catch {}
        };

        socket.onclose = () => {
          socketRef.current = null;
          if (!closedRef.current) {
            reconnectRef.current = setTimeout(connect, 3000);
          }
        };
      } catch {
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      closedRef.current = true;
      reconnectRef.current && clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, [clusterUrl, setActiveConnections]);

  return null;
}
