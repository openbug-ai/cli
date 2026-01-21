import readline from "readline";
import yaml from "js-yaml";
import fs from "fs";

let openBugYAML = {};
if (fs.existsSync("openbug.yaml")) {
  const readYAMLFile = fs.readFileSync("openbug.yaml", "utf8");
  openBugYAML = yaml.load(readYAMLFile) ?? {};
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function upsertConfigValue(contents, key, value) {
  const keyRegex = new RegExp(`^${escapeRegExp(key)}\\s*=.*$`, "m");
  const nextLine = `${key}=${value}`;
  if (keyRegex.test(contents)) {
    return contents.replace(keyRegex, nextLine);
  }
  const trimmed = contents.trimEnd();
  const prefix = trimmed.length > 0 ? `${trimmed}\n` : "";
  return `${prefix}${nextLine}\n`;
}

export function readProjects(contents) {
  const match = contents.match(/^projects\s*=\s*(\[.*\]|\{.*\})$/m);
  if (!match) {
    return [];
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return Object.entries(parsed).map(([id, list]) => ({
      id,
      projects: Array.isArray(list) ? list : [],
    }));
  } catch (err) {
    console.warn(
      "⚠️  Failed to parse projects JSON; resetting to empty array."
    );
    return [];
  }
}

export function writeProjects(contents, projectsArr) {
  const serialized = JSON.stringify(projectsArr);
  return upsertConfigValue(contents, "projects", serialized);
}

export function parseConfigFlags(argsList) {
  let projectId = openBugYAML.id;
  let message = openBugYAML.description;

  for (let i = 1; i < argsList.length; i += 1) {
    const token = argsList[i];

    if (token === "-id") {
      if (projectId !== undefined) {
        console.error("❌ Duplicate -id flag detected.");
        process.exit(1);
      }
      const next = argsList[i + 1];
      if (!next) {
        console.error(`Missing project ID.

Usage:
  debug init --id <project-id> [-m "<description>"]`);
        process.exit(1);
      }
      projectId = next.trim();
      i += 1;
    } else if (token === "-m") {
      if (message !== undefined) {
        console.error("❌ Duplicate -m flag detected.");
        process.exit(1);
      }
      const next = argsList[i + 1];
      if (!next) {
        console.error(`Missing process description.

Each process needs a short description so it can
be referenced later in conversations.

Usage:
  debug init -id <project-id> -m "<process description>"
`);
        process.exit(1);
      }
      message = next.trim();
      i += 1;
    }
  }
  if (!message) {
    console.error(`Missing process description.

Each process needs a short description so it can
be referenced later in conversations.

Usage:
  oncall init -id <project-id> -m "<process description>"
`);
    process.exit(1);
  }
  return { projectId, message };
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptForNewProjectId(projectsList) {
  while (true) {
    const input = await prompt("Enter new project id: ");
    if (!input) {
      console.log("Project id cannot be empty.");
      continue;
    }
    const exists = projectsList.some((entry) => entry.id === input);
    if (exists) {
      console.log("Project id already exists. Please choose a different id.");
      continue;
    }
    return input;
  }
}

async function promptForExistingProject(projectsList) {
  console.log("\nAvailable projects:");
  projectsList.forEach((entry, index) => {
    console.log(`  ${index + 1}. ${entry.id}`);
  });
  while (true) {
    const input = await prompt("Select a project by number: ");
    const choice = Number.parseInt(input, 10);
    if (Number.isNaN(choice) || choice < 1 || choice > projectsList.length) {
      console.log("Please enter a valid number from the list.");
      continue;
    }
    return projectsList[choice - 1].id;
  }
}

export async function resolveProjectId(initialId, projectsList) {
  if (initialId) {
    return initialId;
  }

  console.log("\nChoose an option:");
  console.log("  1. Create new project");
  console.log("  2. Use existing project");

  while (true) {
    const choice = await prompt("Enter choice (1 or 2): ");
    if (choice === "1") {
      return promptForNewProjectId(projectsList);
    }
    if (choice === "2") {
      if (projectsList.length === 0) {
        console.log("No existing projects found. Please create a new project.");
        return promptForNewProjectId(projectsList);
      }
      return promptForExistingProject(projectsList);
    }
    console.log("Invalid choice. Please enter 1 or 2.");
  }
}

export async function promptForInput(message) {
  while (true) {
    const input = await prompt(`${message} `);
    if (!input) {
      console.log("Project id cannot be empty.");
      continue;
    }
    return input;
  }
}
