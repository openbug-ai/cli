import fs from "fs";
import path from "path";
import os from "os";
import WebSocket from "ws";
import YAML from "yaml";

export const HOME_DIR = os.homedir();
export const OPENBUG_DIR = path.join(HOME_DIR, ".openbug");
export const CONFIG_PATH = path.join(OPENBUG_DIR, "config");
export const LOGS_DIR = path.join(OPENBUG_DIR, "logs");
export const CONFIG_TEMPLATE = `# OpenBug Configuration File
#
# Configuration for local single-user deployment
# Backend URL and WebSocket URL can be configured here or via environment variables
#
# Project mappings (stored as JSON)
projects=[]
`;

export function readConfigValue(key) {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    const contents = fs.readFileSync(CONFIG_PATH, "utf8");
    const match = contents.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function getConfigValue(key, defaultValue) {
  const configValue = readConfigValue(key);
  if (configValue) {
    return configValue;
  }
  const envValue = process.env[key];
  if (envValue) {
    return envValue;
  }
  return defaultValue;
}

//print help
export function printHelp() {
  console.log(`OpenBug — AI debugging copilot for running applications

Usage:
  debug <your command>

OpenBug requires a local server to be running:
  debug cluster

Run your app with OpenBug watching it:
  debug <your command>

  Examples:
    debug npm run start
    debug node server.js
    debug python app.py

Commands:
  init         register the current project
  cluster      start the local OpenBug server
  version      show version information

Use --help with individual commands for details.
`);
}

//print init help
export function printInitHelp() {
  console.log(`Register a process with an OpenBug project.

An OpenBug project groups multiple processes together
so their runtime signals can be referenced in the same context.

Usage:
  debug init --id <project-id> -m "<process description>"

Options:
  --id    Project identifier used to group related processes
  -m      Short description of this process (used in conversations)

Notes:
  • Multiple processes can share the same project ID
  • Each process must have its own description
  • Processes may be started from different directories

`);
}
//print cluster help
export function printClusterHelp() {
  console.log(`Start the local OpenBug server for this project.

The OpenBug server connects all processes in the project
so their runtime signals (logs, errors, requests) can be
referenced together.

This command must be running before you execute:
  debug <your command>

Usage:
  debug cluster

Notes:
  • Keep this running in a separate terminal
  • Run each service or process using "debug <your command>"
  • Press Ctrl+C to stop the server
`);
}

export function ensureConfigDir() {
  if (!fs.existsSync(OPENBUG_DIR)) {
    fs.mkdirSync(OPENBUG_DIR, { recursive: true });
    console.log(`✅ Created configuration directory: ${OPENBUG_DIR}`);
  }
}

export function buildYaml(projectId, description, name) {
  const escape = (value) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const hardcodedProjectId = "openbug-service";
  const lines = [
    `id: "${escape(hardcodedProjectId)}"`,
    `description: "${escape(description)}"`,
  ];
  if (name) {
    lines.push(`name: "${escape(name)}"`);
  }
  const window_id = Date.now();
  lines.push(`window_id: ${window_id}`);
  lines.push(`logs_available: true`);
  lines.push(`code_available: true`);
  return `${lines.join("\n")}\n`;
}

export function loadProjectMetadata(cwdPath = process.cwd()) {
  const yamlPath = path.join(cwdPath, "openbug.yaml");
  if (!fs.existsSync(yamlPath)) {
    return null;
  }

  try {
    const contents = fs.readFileSync(yamlPath, "utf8");
    const data = YAML.parse(contents);

    if (!data?.id || !data?.description) {
      console.warn(
        'openbug.yaml is missing either "id" or "description". Proceeding without project metadata.'
      );
      return null;
    }
    return {
      id: data?.id || "",
      description: data?.description || "",
      name: data?.name || "",
      window_id: data?.window_id ? Number(data.window_id) : undefined,
      logs_available: data?.logs_available || true,
      code_available: data?.code_available || true,
      path: cwdPath,
      raw: contents,
    };
  } catch (error) {
    console.warn("Failed to read openbug.yaml. Proceeding without it.", error);
    return null;
  }
}

export function registerProjectWithCluster(
  metadata,
  clusterUrl = getConfigValue("CLUSTER_URL", "ws://127.0.0.1:4466")
) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    try {
      socket = new WebSocket(clusterUrl);
    } catch (error) {
      console.warn(
        "Unable to connect to local cluster server. Continuing without registration."
      );
      resolve(false);
      return;
    }

    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        socket?.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      cleanup(false);
    }, 2000);

    socket.on("open", () => {
      try {
        const projectPayload = {
          id: metadata.id,
          description: metadata.description,
          name: metadata.name,
          path: metadata.path,
          window_id:
            typeof metadata.window_id === "number"
              ? metadata.window_id
              : Date.now(),
          logs_available:
            typeof metadata.logs_available === "boolean"
              ? metadata.logs_available
              : true,
          code_available:
            typeof metadata.code_available === "boolean"
              ? metadata.code_available
              : true,
        };
        socket.send(
          JSON.stringify({
            type: "register",
            project: projectPayload,
          })
        );
      } catch (error) {
        console.warn(
          "Failed to send register payload to local cluster server. Continuing without registration."
        );
        cleanup(false);
      }
    });

    socket.on("message", (data) => {
      try {
        const serialized =
          typeof data === "string" ? data : data.toString("utf8");
        if (!serialized) {
          return;
        }
        const parsed = JSON.parse(serialized);
        if (parsed.type === "register_ack") {
          cleanup(true);
        }
      } catch {
        // ignore malformed ack
      }
    });

    socket.on("close", () => {
      cleanup(true);
    });

    socket.on("error", () => {
      cleanup(false);
    });
  });
}

export function fetchProjectsFromCluster(
  metadata,
  clusterUrl = getConfigValue("CLUSTER_URL", "ws://127.0.0.1:4466")
) {
  // console.log(`Called fetchProjects, ${JSON.stringify(metadata)}`);
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    try {
      logd(`connecting to socket cluster to fetch`);
      socket = new WebSocket(clusterUrl);
    } catch (error) {
      console.warn(
        "Unable to connect to local cluster server. Could not fetch projects."
      );
      logd(
        "Unable to connect to local cluster server. Could not fetch projects."
      );
      resolve(false);
      return;
    }

    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        socket?.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      logd("Fetching projects timed out");
      cleanup(false);
    }, 2000);

    socket.on("open", () => {
      try {
        socket.send(
          JSON.stringify({
            type: "fetch_projects",
            id: metadata.id,
          })
        );
      } catch (error) {
        console.warn(
          "Failed to send request to local cluster server. Continuing without fetching projects."
        );
        logd("error sending fetch_projects req to cluster");
        cleanup(false);
      }
    });

    socket.on("message", (data) => {
      try {
        const serialized =
          typeof data === "string" ? data : data.toString("utf8");
        if (!serialized) {
          return;
        }
        const parsed = JSON.parse(serialized);
        if (parsed.type === "fetch_projects_ack") {
          cleanup(parsed);
        }
      } catch {
        // ignore malformed ack
        logd("Malformed ack");
      }
    });

    socket.on("close", () => {
      logd("Connection closed");
      cleanup(false);
    });

    socket.on("error", () => {
      logd("Connection errored");
      cleanup(false);
    });
  });
}

export async function ensureClusterIsReady(metadata, registrationPromise) {
  if (!metadata) {
    await registrationPromise?.catch(() => null);
    return true;
  }
  try {
    const result = await registrationPromise;
    return result !== false;
  } catch {
    return false;
  }
}

export function logd(d) {
  // try {
  //   if (!fs.existsSync(LOGS_DIR)) {
  //     fs.mkdirSync(LOGS_DIR, { recursive: true });
  //   }
  //   const now = new Date();
  //   const day = String(now.getDate()).padStart(2, "0");
  //   const month = String(now.getMonth() + 1).padStart(2, "0");
  //   const year = String(now.getFullYear());
  //   const dateStr = `${day}${month}${year}`;
  //   const logFilePath = path.join(LOGS_DIR, `logs_${dateStr}.txt`);
  //   fs.appendFileSync(logFilePath, `${d}\n`);
  // } catch (error) {
  //   console.error("Failed to log to logs file", error);
  // }
}
