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
      "Failed to fetch project name from OpenBug API.",
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
        `\n🎉 Successfully initialized OpenBug!\nConfiguration file created at: ${CONFIG_PATH}\n`
      );
    }

    const { projectId, message } = parseConfigFlags(argsList);
    const resolvedProjectId =
      projectId ||
      (await promptForInput(
        "\nEnter a project ID so OpenBug can keep all sessions that share it in sync :"
      ));

    const generatedName = await fetchYamlName(message);
    const yamlPath = path.join(process.cwd(), "openbug.yaml");
    const yamlContent = buildYaml(resolvedProjectId, message, generatedName);
    const isExists = fs.existsSync(yamlPath);
    fs.writeFileSync(yamlPath, yamlContent, "utf8");
    if (isExists) {
      console.log(`Project registered with OpenBug.

Project ID: ${projectId}
Description: ${message}

Processes using this project ID will
share runtime context while the OpenBug server is running.

Next:
  Start the OpenBug interface:
    debug
`);
    } else {
      console.log(`Project registered with OpenBug.

Project ID: ${projectId}
Description: ${message}

Processes using this project ID will
share runtime context while the OpenBug server is running.

Next:
  Start the OpenBug interface:
    debug
`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`\nFailed to register this process with OpenBug.

Unable to write local OpenBug config.
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
//     Get a new auth key from your OpenBug account and try again.
//     `);
//     } else {
//       console.error(" Failed to save auth key:", error);
//     }
//   }
// };



async function handleConfig(argsList) {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      "No OpenBug configuration found. Run \`debug init\` first."
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


async function handleBeginCommand() {


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

    console.log(`OpenBug server is running at ws://${host}:${port}\n`);

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
  
  if (args.length === 0) {
    checkVersionCompatibility();
    projectRegistrationPromise.catch(() => null);
    await handleBeginCommand();
    return;
  }

  if (args[0] === "--help" || args[0] === "-h") {
    printHelp();
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


  if (command === "config") {
    projectRegistrationPromise.catch(() => null);
    await handleConfig(args);
    return;
  }

  const clusterReady = await ensureClusterReady();
  const yamlPath = path.join(process.cwd(), "openbug.yaml");
  if (!clusterReady) {
    console.error(
      `\nOpenBug server is not running.

Start it in another terminal:
  debug
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
        "openbug-service",
        description.trim(),
        generatedName
      );
      fs.writeFileSync(yamlPath, yamlContent, "utf8");

      console.log(
        `\n✅ Project registered with OpenBug (project ID: openbug-service)\n`
      );
      const newMetadata = loadProjectMetadata();

      // console.log("newMetadata", newMetadata);
      if (newMetadata) {
        registerProjectWithCluster(newMetadata).catch(() => null);
      }
    } catch (err) {
      console.error(`\n❌ Failed to create openbug.yaml: ${err.message}\n`);
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
