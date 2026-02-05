import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";
import { ensureConfigDir } from "../../helpers/cli-helpers.js";
import { upsertConfigValue } from "../../helpers/config-helpers.js";
//base api
const API_BASE_URL = process.env.API_BASE_URL || "https://api.oncall.build/v2/api";

//path of the config file
const HOME_DIR = os.homedir();
const ONCALL_DIR = path.join(HOME_DIR, ".openbug");
const CONFIG_PATH = path.join(ONCALL_DIR, "config");

//check for the api key in openbug/config path
export async function checkApiKey() {
  try {
    const configText = fs.readFileSync(CONFIG_PATH, "utf8");
    const match = configText.match(/^API_KEY\s*=\s*(.*)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (err) {}
  return null;
}

//validate the api key entered by the user
export async function validateAndSaveApiKey(authKey) {
  if (!authKey || typeof authKey !== "string" || !authKey.trim()) {
    return { valid: false, error: "Invalid API key format" };
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      authKey: authKey.trim(),
    });

    if (response) {
      ensureConfigDir();
      let contents = "";
      if (fs.existsSync(CONFIG_PATH)) {
        contents = fs.readFileSync(CONFIG_PATH, "utf8");
      }
      const updatedContents = upsertConfigValue(
        contents,
        "API_KEY",
        authKey.trim(),
      );
      fs.writeFileSync(CONFIG_PATH, updatedContents, "utf8");
      return { valid: true };
    } else {
      return { valid: false, error: "Invalid API key" };
    }
  } catch (err) {
    if (
      err.response &&
      err.response.data &&
      err.response.data.message === "Invalid auth key"
    ) {
      return {
        valid: false,
        error:
          "The provided auth key is invalid or has expired.\n\nGet a new auth key from your OnCall account and try again.",
      };
    } else {
      return {
        valid: false,
        error: `Failed to validate API key: ${err.message || String(err)}`,
      };
    }
  }
}

// fetch logs
export async function fetchLogsFromCluster(
  windowId: number,
  clusterUrl = process.env.OPENBUG_CLUSTER_URL || "ws://127.0.0.1:4466",
): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(clusterUrl);
    } catch (error) {
      resolve("");
      return;
    }

    const cleanup = () => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {}
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve("");
    }, 5000);

    socket.onopen = () => {
      try {
        socket?.send(
          JSON.stringify({
            type: "fetch_logs",
            window_id: windowId,
          }),
        );
      } catch (error) {
        cleanup();
        resolve("");
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.type === "fetch_logs_ack") {
          cleanup();
          clearTimeout(timeoutId);
          const logs = data.logs || "";
          resolve(logs);
        } else if (data.type === "error") {
          cleanup();
          resolve("");
        }
      } catch (error) {}
    };

    socket.onerror = (error) => {
      cleanup();
      resolve("");
    };

    socket.onclose = () => {
      if (!settled) {
        cleanup();
        resolve("");
      }
    };
  });
}

type Project = {
  path: string;
  description: string;
  name?: string;
  window_id: number;
  logs_available: boolean;
  code_available: boolean;
};

export function generateArchitecture(projects: Project[]) {
  let res = "";
  function avaiableData(project: Project) {
    if (project.code_available && project.logs_available) {
      return `- codebase 
        - logs`;
    }
    if (project.code_available) return `- codebase`;
    if (project.logs_available) return `- logs`;
  }
  projects.forEach((project) => {
    res += `
      	id: ${project.window_id} 
        service_name: ${project.name}
        service_description: ${project.description}
        available_data:
        ${avaiableData(project)}
        `;
  });
  return res;
}