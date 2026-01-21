import { once } from "events";
import { AddressInfo } from "net";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { logd } from "./helpers/cli-helpers.js";

type Logger = Pick<Console, "log" | "info" | "warn" | "error">;

export interface OnCallWebSocketServerOptions {
  port?: number;
  host?: string;
  logger?: Logger;
}

interface ProjectRegistrationPayload {
  id: string;
  description: string;
  path: string;
  name?: string;
  window_id?: number;
  logs_available?: boolean;
  code_available?: boolean;
}

interface ProjectRecord {
  id: string;
  projects: Array<{
    path: string;
    description: string;
    name?: string;
    window_id: number;
    logs_available: boolean;
    code_available: boolean;
  }>;
}

type SocketMessage =
  | { type: "register"; project?: ProjectRegistrationPayload }
  | { type: string; [key: string]: unknown };

const DEFAULT_PORT =
  Number.parseInt(process.env.OPENBUG_WS_PORT ?? "", 10) || 6111;
const DEFAULT_HOST = process.env.OPENBUG_WS_HOST || "127.0.0.1";

interface LogEntry {
  logs: string;
  lastActivity: number;
}

export class OnCallWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly allProjects: ProjectRecord[] = [];
  private readonly logsStorage: Map<number, LogEntry> = new Map();
  private readonly activeWindowIds: Set<number> = new Set();
  private readonly subscribedClients: Set<WebSocket> = new Set();
  private readonly socketToProject: Map<WebSocket, { projectId: string; path: string; windowId?: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly options: Required<
    Pick<OnCallWebSocketServerOptions, "port" | "host">
  > & { logger: Logger };

  private readonly LOG_MAX_SIZE = 10000;
  private readonly LOG_TTL_MS = 30 * 60 * 1000; // 30 minutes - logs expire after inactivity
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run cleanup every 5 minutes

  constructor(options: OnCallWebSocketServerOptions = {}) {
    this.options = {
      port: options.port ?? DEFAULT_PORT,
      host: options.host ?? DEFAULT_HOST,
      logger: options.logger ?? console,
    };
  }

  get address(): AddressInfo | null {
    if (!this.wss) return null;
    const addr = this.wss.address();
    return typeof addr === "string" || addr === null ? null : addr;
  }

  async start(): Promise<void> {
    if (this.wss) {
      // this.options.logger.warn("Attempted to start an already running server.");
      return;
    }

    this.wss = new WebSocketServer({
      host: this.options.host,
      port: this.options.port,
    });

    this.wss.on("connection", (socket, request) =>
      this.handleConnection(socket, request.headers)
    );
    this.wss.on("close", () => this.handleServerClose());
    
    this.startCleanupInterval();

    try {
      await Promise.race([
        once(this.wss, "listening"),
        once(this.wss, "error").then(([error]) => {
          throw error;
        }),
      ]);
    } catch (error) {
      // this.options.logger.error(
      //   `Failed to start WebSocket server on ws://${this.options.host}:${this.options.port}`,
      //   error
      // );
      await this.stop();

      if (
        error.code === "EADDRINUSE" ||
        error.message.includes("address already in use")
      ) {
        throw `Failed to start the OpenBug server.

      Port 4466 is already in use.
      Stop the other process or free the port and try again.
      `;
      } else {
        throw error;
      }
    }
  }

  async stop(): Promise<void> {
    this.stopCleanupInterval();
    if (!this.wss) {
      return;
    }

    const server = this.wss;
    this.wss = null;

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    this.logsStorage.clear();
    this.activeWindowIds.clear();
    // this.options.logger.info("Server stopped.");
  }

  private handleServerClose() {
    this.stopCleanupInterval();
  }
  
  private startCleanupInterval() {
    if (this.cleanupInterval) {
      return;
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleLogs();
    }, this.CLEANUP_INTERVAL_MS);
  }
  
  private stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  private cleanupStaleLogs() {
    const now = Date.now();
    const toDelete: number[] = [];
    
    for (const [windowId, entry] of this.logsStorage.entries()) {
      if (!this.activeWindowIds.has(windowId)) {
        toDelete.push(windowId);
        continue;
      }
      
      if (now - entry.lastActivity > this.LOG_TTL_MS) {
        toDelete.push(windowId);
        this.activeWindowIds.delete(windowId);
      }
    }
    
    for (const windowId of toDelete) {
      this.logsStorage.delete(windowId);
    }
    
    if (toDelete.length > 0) {
      logd(`[Cleanup] Removed ${toDelete.length} stale log entries`);
    }
  }
  private cleanupLogsForWindowId(windowId: number) {
    this.logsStorage.delete(windowId);
    this.activeWindowIds.delete(windowId);
  }

  private handleConnection(
    socket: WebSocket,
    headers: Record<string, string | string[] | undefined>
  ) {
    // this.options.logger.info(
    //   `Client connected from ${headers["x-forwarded-for"] || "local"}`
    // );
    socket.on("message", (data) => this.handleMessage(socket, data));
    socket.on("close", (code, reason) => {
      this.subscribedClients.delete(socket);
      this.handleSocketDisconnect(socket);
      // this.options.logger.info(
      //   `Client disconnected`
      // );
    });
    socket.on("error", (error) => {
      this.subscribedClients.delete(socket);
      this.handleSocketDisconnect(socket);
      // this.options.logger.warn("Client error:", error);
      socket.close(1011, "internal_error");
    });
  }
  
  private handleSocketDisconnect(socket: WebSocket) {
    const registration = this.socketToProject.get(socket);
    if (!registration) {
      return;
    }
    
    const projectRecord = this.allProjects.find(
      (entry) => entry.id === registration.projectId
    );
    
    if (projectRecord) {
      const index = projectRecord.projects.findIndex(
        (p) => p.path === registration.path
      );
      
      if (index >= 0) {
        const removedProject = projectRecord.projects[index];
        projectRecord.projects.splice(index, 1);
        
        if (removedProject.window_id) {
          this.activeWindowIds.delete(removedProject.window_id);
          this.logsStorage.delete(removedProject.window_id);
        }
        
        // Broadcast the update to subscribed clients
        this.broadcastProjectUpdate(registration.projectId);
        
        logd(`Removed project ${registration.path} from ${registration.projectId} due to disconnect`);
      }
    }
    this.socketToProject.delete(socket);
  }
  
  private broadcastProjectUpdate(projectId: string) {
    const projectRecord = this.allProjects.find((entry) => entry.id === projectId);
    if (!projectRecord) return;
    
    const message = JSON.stringify({
      type: "project_update",
      projectId: projectId,
      projects: projectRecord.projects,
    });

    this.subscribedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          this.subscribedClients.delete(client);
        }
      } else {
        this.subscribedClients.delete(client);
      }
    });
  }

  private handleMessage(socket: WebSocket, raw: RawData) {
    let payload: SocketMessage;
    try {
      const serialized =
        typeof raw === "string" ? raw : raw.toString("utf8").trim();
      if (!serialized) return;
      payload = JSON.parse(serialized);
    } catch (error) {
      this.send(socket, {
        type: "error",
        message: "Invalid JSON payload",
      });
      // this.options.logger.warn("Invalid payload received:", error);
      return;
    }

    switch (payload.type) {
      case "register": {
        const projectPayload =
          "project" in payload
            ? (payload as { project?: ProjectRegistrationPayload }).project
            : undefined;
        const project = this.normalizeProjectPayload(projectPayload);
        if (!project) {
          this.send(socket, {
            type: "error",
            message: "Invalid project payload for register channel",
          });
          return;
        }
        const projectRecord = this.upsertProjectRegistration(project);
        
        if (project.window_id) {
          this.activeWindowIds.add(project.window_id);
        }
        
        this.send(socket, {
          type: "register_ack",
          projectId: project.id,
          totalRegisteredProjects: projectRecord.projects.length,
        });
        
        this.broadcastProjectUpdate(project.id);
        break;
      }
      case "subscribe_updates": {
        this.subscribedClients.add(socket);
        const projectId = (payload as any).id || "openbug-service";
        const projectRecord = this.allProjects.find((entry) => entry.id === projectId);
        if (projectRecord) {
          this.send(socket, {
            type: "project_update",
            projectId: projectId,
            projects: projectRecord.projects,
          });
        } else {
          this.send(socket, {
            type: "project_update",
            projectId: projectId,
            projects: [],
          });
        }
        break;
      }
      case "fetch_projects": {
        logd("Received the fetch_projects_req");
        let projectRecord = this.allProjects.find(
          (entry) => entry.id === payload.id
        );
        if (!projectRecord) {
          logd("No project record found for id: " + payload.id);
          this.send(socket, {
            type: "fetch_projects_ack",
            projects: [],
          });
          logd("Sent empty response for fetch_projects");
          break;
        }
        logd("Found the following: " + JSON.stringify(projectRecord?.projects));
        this.send(socket, {
          type: "fetch_projects_ack",
          projects: projectRecord?.projects,
        });
        logd("Sent the response for fetch_projects");
        break;
      }
      case "stream_logs": {
        const windowId = (payload as any).window_id;
        const logChunk = (payload as any).logs || "";
        if (windowId && typeof windowId === "number") {
          this.activeWindowIds.add(windowId);
          
          const existingEntry = this.logsStorage.get(windowId);
          const existingLogs = existingEntry?.logs || "";
          const updatedLogs = (existingLogs + logChunk).slice(-this.LOG_MAX_SIZE);
          
          this.logsStorage.set(windowId, {
            logs: updatedLogs,
            lastActivity: Date.now(),
          });
          
          for (const projectRecord of this.allProjects) {
            const project = projectRecord.projects.find(p => p.window_id === windowId);
            if (project) {
              const existing = this.socketToProject.get(socket);
              if (!existing || existing.windowId !== windowId) {
                this.socketToProject.set(socket, {
                  projectId: projectRecord.id,
                  path: project.path,
                  windowId: windowId,
                });
              }
              break;
            }
          }
        }
        break;
      }
      case "fetch_logs": {
        const windowId = (payload as any).window_id;
        if (windowId && typeof windowId === "number") {
          const entry = this.logsStorage.get(windowId);
          const logs = entry?.logs || "";
          this.send(socket, {
            type: "fetch_logs_ack",
            window_id: windowId,
            logs: logs,
          });
        } else {
          this.send(socket, {
            type: "error",
            message: "Invalid window_id for fetch_logs",
          });
        }
        break;
      }
      default: {
        this.send(socket, {
          type: "ack",
          message: `Unhandled message type "${payload.type}"`,
        });
      }
    }
  }

  private send(socket: WebSocket, message: Record<string, unknown>) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      // this.options.logger.warn("Failed to send message to client:", error);
    }
  }

  private normalizeProjectPayload(
    payload: ProjectRegistrationPayload | undefined
  ): ProjectRegistrationPayload | null {
    if (
      !payload ||
      typeof payload.id !== "string" ||
      typeof payload.description !== "string" ||
      typeof payload.path !== "string"
    ) {
      return null;
    }
    const id = payload.id.trim();
    const description = payload.description.trim();
    const projectPath = payload.path.trim();
    const name =
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : undefined;
    const window_id =
      typeof payload.window_id === "number" ? payload.window_id : Date.now();
    const logs_available =
      typeof payload.logs_available === "boolean"
        ? payload.logs_available
        : true;
    const code_available =
      typeof payload.code_available === "boolean"
        ? payload.code_available
        : true;
    if (!id || !description || !projectPath) {
      return null;
    }
    return {
      id,
      description,
      path: projectPath,
      name,
      window_id,
      logs_available,
      code_available,
    };
  }

  private upsertProjectRegistration(
    project: ProjectRegistrationPayload
  ): ProjectRecord {
    let projectRecord = this.allProjects.find(
      (entry) => entry.id === project.id
    );
    if (!projectRecord) {
      projectRecord = { id: project.id, projects: [] };
      this.allProjects.push(projectRecord);
    }
    const existingProject = projectRecord.projects.find(
      (item) => item.path === project.path
    );
    if (existingProject) {
      existingProject.description = project.description;
      if (project.name) {
        existingProject.name = project.name;
      }
      existingProject.window_id = project.window_id!;
      existingProject.logs_available = project.logs_available!;
      existingProject.code_available = project.code_available!;
    } else {
      projectRecord.projects.push({
        path: project.path,
        description: project.description,
        name: project.name,
        window_id: project.window_id!,
        logs_available: project.logs_available!,
        code_available: project.code_available!,
      });
    }

    // this.options.logger.info(
    //   `Registered project "${project.id}" -> ${project.path} (total directories: ${projectRecord.projects.length})`
    // );
    // const snapshot = JSON.stringify(this.allProjects, null, 2);
    // this.options.logger.info(`Current projects: ${snapshot}`);

    return projectRecord;
  }
}

export async function startOnCallWebSocketServer(
  options?: OnCallWebSocketServerOptions
): Promise<OnCallWebSocketServer> {
  const server = new OnCallWebSocketServer(options);
  await server.start();
  return server;
}
