#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import {
  writeProjects,
  readProjects,
  upsertConfigValue,
  parseConfigFlags,
  resolveProjectId,
  promptForInput,
} from "../dist/helpers/config-helpers.js";
import {
  CONFIG_PATH,
  CONFIG_TEMPLATE,
  ensureConfigDir,
  buildYaml,
  loadProjectMetadata,
  registerProjectWithCluster,
  ensureClusterIsReady,
  printHelp,
  printLoginHelp,
  printInitHelp,
} from "../dist/helpers/cli-helpers.js";
import {
  checkVersionAndExit,
  checkVersionCompatibility,
  checkForUpdates,
} from "../dist/utils/version-check.js";
//f7871b3a372bc5e23768ec80a8a5c3f86704788bb2b4eda0
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, "../package.json");
const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const args = process.argv.slice(2);

const detectedProjectMetadata = loadProjectMetadata();
const projectRegistrationPromise = detectedProjectMetadata
  ? registerProjectWithCluster(detectedProjectMetadata)
  : Promise.resolve(null);

import { getConfigValue } from "../dist/helpers/cli-helpers.js";

const API_BASE_URL = getConfigValue(
  "API_BASE_URL",
  "https://api.oncall.build/v2/api"
);

async function fetchYamlName(description, cwdPath = process.cwd()) {
  const url = `${API_BASE_URL}/tool/generateyamlName`;
  try {
    const response = await axios.post(url, {
      currentDirectory: cwdPath,
      description,
    });
    const name = response?.data?.data?.name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
    return null;
  } catch (error) {
    await checkVersionCompatibility(true).catch(() => {});
    console.warn(
      "Failed to fetch project name from OnCall API.",
      error?.message || error
    );
    return null;
  }
}

async function handleInit(argsList) {
  try {
    ensureConfigDir();
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, CONFIG_TEMPLATE, "utf8");
      console.log(
        `\n🎉 Successfully initialized OnCall!\nConfiguration file created at: ${CONFIG_PATH}\n\nPlease edit this file and add your OnCall API KEY:\nAPI_KEY=<YOUR_ONCALL_API_KEY>\n`
      );
    }

    const { projectId, message } = parseConfigFlags(argsList);
    const resolvedProjectId =
      projectId ||
      (await promptForInput(
        "\nEnter a project ID so OnCall can keep all sessions that share it in sync :"
      ));

    const generatedName = await fetchYamlName(message);
    const yamlPath = path.join(process.cwd(), "oncall.yaml");
    const yamlContent = buildYaml(resolvedProjectId, message, generatedName);
    const isExists = fs.existsSync(yamlPath);
    fs.writeFileSync(yamlPath, yamlContent, "utf8");
    if (isExists) {
      console.log(`Project registered with OnCall.

Project ID: ${projectId}
Description: ${message}

Processes using this project ID will
share runtime context while the OnCall server is running.

Next:
  Start the OnCall interface:
    oncall start
`);
    } else {
      console.log(`Project registered with OnCall.

Project ID: ${projectId}
Description: ${message}

Processes using this project ID will
share runtime context while the OnCall server is running.

Next:
  Start the OnCall interface:
    oncall start
`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`\nFailed to register this process with OnCall.

Unable to write local OnCall config.
Check directory permissions and try again.
`);
    process.exit(1);
  }
}

//check for valid auth key
// const isValidAuthKey = async (authKey) => {
//   try {
//     const isValid = await axios.post(`${BASE_URL}/auth/login`, { authKey });
//     return isValid.data;
//   } catch (error) {
//     if (error.response.message === "Invalid auth key") {
//       console.error(`Authentication failed.
//     The provided auth key is invalid or has expired.
//     Get a new auth key from your OnCall account and try again.
//     `);
//     } else {
//       console.error(" Failed to save auth key:", error);
//     }
//   }
// };

async function handleLogin(authKey) {
  if (!authKey || typeof authKey !== "string" || !authKey.trim()) {
    // console.error("\n❌ Usage: oncall login <your-auth-key>");
    console.error(`Missing auth key.

Usage:
  oncall login <auth-key>`);

    process.exit(1);
  }
  try {
    // const isValid = await isValidAuthKey(authKey);
    const isValid = await axios.post(`${API_BASE_URL}/auth/login`, { authKey });

    if (isValid) {
      ensureConfigDir();
      let contents = "";
      if (fs.existsSync(CONFIG_PATH)) {
        contents = fs.readFileSync(CONFIG_PATH, "utf8");
      }
      const updatedContents = upsertConfigValue(contents, "API_KEY", authKey);
      fs.writeFileSync(CONFIG_PATH, updatedContents, "utf8");
      console.log("✅ Auth key saved.\n");
      console.log(`Next:
    Initialize a project with:
    	oncall init -id "name this project" -m "describe this service"`);
      process.exit(0);
    } else {
      console.error(" Invalid Key");
    }
  } catch (err) {
    if (err.response.data.message === "Invalid auth key") {
      console.error(`Authentication failed.

The provided auth key is invalid or has expired.

Get a new auth key from your OnCall account and try again.
`);
    } else {
      console.error("❌❌ Failed to save auth key:", err);
    }
    process.exit(1);
  }
}

async function handleConfig(argsList) {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      "No OnCall configuration found. Run `oncall init` or `oncall login` first."
    );
    process.exit(1);
  }

  const { projectId, message } = parseConfigFlags(argsList);
  const cwdPath = process.cwd();
  const cwdMetadata = loadProjectMetadata(cwdPath);
  const projectName = cwdMetadata?.name ?? null;
  const window_id =
    typeof cwdMetadata?.window_id === "number"
      ? cwdMetadata.window_id
      : Date.now();
  const logs_available =
    typeof cwdMetadata?.logs_available === "boolean"
      ? cwdMetadata.logs_available
      : true;
  const code_available =
    typeof cwdMetadata?.code_available === "boolean"
      ? cwdMetadata.code_available
      : true;

  let contents = fs.readFileSync(CONFIG_PATH, "utf8");
  const projectsList = readProjects(contents);
  const resolvedProjectId = await resolveProjectId(projectId, projectsList);
  let projectEntry = projectsList.find(
    (entry) => entry.id === resolvedProjectId
  );
  if (!projectEntry) {
    projectEntry = { id: resolvedProjectId, projects: [] };
    projectsList.push(projectEntry);
  }

  const existingIndex = projectEntry.projects.findIndex(
    (entry) => entry.path === cwdPath
  );
  if (existingIndex >= 0) {
    const existingProject = projectEntry.projects[existingIndex];
    existingProject.description = message;
    if (projectName) {
      existingProject.name = projectName;
    }
    existingProject.window_id = window_id;
    existingProject.logs_available = logs_available;
    existingProject.code_available = code_available;
    console.log(
      `🔁 Updated description for ${cwdPath} under project ${resolvedProjectId}.`
    );
  } else {
    const newProject = {
      path: cwdPath,
      description: message,
      name: projectName ?? undefined,
      window_id,
      logs_available,
      code_available,
    };
    projectEntry.projects.push(newProject);
    console.log(`✅ Added ${cwdPath} to project ${resolvedProjectId}.`);
  }

  contents = writeProjects(contents, projectsList);
  fs.writeFileSync(CONFIG_PATH, contents, "utf8");
  process.exit(0);
}

async function ensureClusterReady() {
  return ensureClusterIsReady(
    detectedProjectMetadata,
    projectRegistrationPromise
  );
}

async function checkApiKey() {
  const HOME_DIR = os.homedir();
  const ONCALL_DIR = path.join(HOME_DIR, ".oncall");
  const CONFIG_PATH = path.join(ONCALL_DIR, "config");
  try {
    const configText = fs.readFileSync(CONFIG_PATH, "utf8");
    const match = configText.match(/^API_KEY\s*=\s*(.*)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (err) {}
  return null;
}

async function validateAndSaveApiKey(authKey) {
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
        authKey.trim()
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

async function handleBeginCommand() {
  let API_KEY = await checkApiKey();
  if (!API_KEY) {
    console.log(`\nYou're not logged in.\n`);
    const authKey = await promptForInput("Please enter your OnCall API key: ");

    if (!authKey || !authKey.trim()) {
      console.error("\n❌ API key cannot be empty. Please try again.");
      process.exit(1);
    }

    const validation = await validateAndSaveApiKey(authKey);

    if (!validation.valid) {
      console.error(`\n❌ ${validation.error}\n`);
      process.exit(1);
    }

    console.log("✅ API key validated and saved.\n");
    API_KEY = authKey.trim();
  }

  let startOnCallWebSocketServer;
  try {
    ({ startOnCallWebSocketServer } = await import(
      "../dist/websocket-server.js"
    ));
  } catch (err) {
    console.error("\nFailed to load the WebSocket server bundle.", err);
    process.exit(1);
  }

  try {
    const server = await startOnCallWebSocketServer({
      port: 4466,
    });
    const address = server.address;
    const host = address?.address ?? "127.0.0.1";
    const port = address?.port ?? 4466;

    console.log(`OnCall server is running at ws://${host}:${port}\n`);

    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      try {
        await server.stop();
      } catch (error) {
        console.error("Error while stopping the WebSocket server:", error);
      } finally {
        process.exit(0);
      }
    };

    ["SIGINT", "SIGTERM"].forEach((signal) => {
      process.once(signal, () => shutdown(signal));
    });

    try {
      global.oncallClusterServer = server;
      await import("../dist/start-ui.js");
    } catch (err) {
      console.error("Failed to load start UI:", err);
      await server.stop();
      process.exit(1);
    }
  } catch (error) {
    if (
      error.code === "EADDRINUSE" ||
      (typeof error === "string" && error.includes("already in use"))
    ) {
      console.log(
        `Port 4466 is already in use. Assuming cluster server is running.\n`
      );
      try {
        await import("../dist/start-ui.js");
      } catch (err) {
        console.error("Failed to load start UI:", err);
        process.exit(1);
      }
    } else {
      console.error("\nFailed to start the WebSocket server:", error);
      process.exit(1);
    }
  }
}

async function main() {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    checkVersionCompatibility();
    process.exit(0);
  }

  if (args[0] === "login" && (args[1] === "--help" || args[1] === "-h")) {
    printLoginHelp();
    checkVersionCompatibility();
    process.exit(0);
  }

  if (args[0] === "init" && (args[1] === "--help" || args[1] === "-h")) {
    printInitHelp();
    checkVersionCompatibility();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(pkgJson.version || "0.0.0");
    process.exit(0);
  }

  await checkVersionAndExit();

  // Check for updates asynchronously (non-blocking)
  // This runs in the background and won't block the CLI execution
  checkForUpdates(pkgJson.name, false).catch(() => {
    // Silently fail - we don't want to interrupt the user's workflow
  });

  const command = args[0];
  if (command === "init") {
    projectRegistrationPromise.catch(() => null);
    await handleInit(args);
    return;
  }

  if (command === "login") {
    projectRegistrationPromise.catch(() => null);
    handleLogin(args[1]);
    return;
  }

  if (command === "config") {
    projectRegistrationPromise.catch(() => null);
    await handleConfig(args);
    return;
  }

  if (command === "start") {
    projectRegistrationPromise.catch(() => null);
    await handleBeginCommand();
    return;
  }

  const clusterReady = await ensureClusterReady();
  const yamlPath = path.join(process.cwd(), "oncall.yaml");
  if (!clusterReady) {
    console.error(
      `\nOnCall server is not running.

Start it in another terminal:
  oncall start
\n`
    );
    process.exit(1);
  }

  if (!fs.existsSync(yamlPath)) {
    try {
      ensureConfigDir();
      const description = await promptForInput(
        "\nEnter a description for this service: "
      );

      if (!description || !description.trim()) {
        console.error("\nDescription cannot be empty. Exiting.");
        process.exit(1);
      }

      const generatedName = await fetchYamlName(description.trim());
      const yamlContent = buildYaml(
        "oncall-service",
        description.trim(),
        generatedName
      );
      fs.writeFileSync(yamlPath, yamlContent, "utf8");

      console.log(
        `\n✅ Project registered with OnCall (project ID: oncall-service)\n`
      );
      const newMetadata = loadProjectMetadata();

      // console.log("newMetadata", newMetadata);
      if (newMetadata) {
        registerProjectWithCluster(newMetadata).catch(() => null);
      }
    } catch (err) {
      console.error(`\n❌ Failed to create oncall.yaml: ${err.message}\n`);
      process.exit(1);
    }
  }
  try {
    await import("../dist/index.js");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
// #are we allowing to update the yaml, if so need the proper message to display after updating
// #which are the special character we are not allowing as the id
