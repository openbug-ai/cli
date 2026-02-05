import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import axios from "axios";

import { getConfigValue } from "../helpers/cli-helpers.js";

const OPENBUG_DIR = path.join(os.homedir(), ".openbug");
const VERSION_CACHE_FILE = path.join(OPENBUG_DIR, "version-cache.json");
const API_BASE_URL = getConfigValue(
  "API_BASE_URL",
  "https://api.oncall.build/v2/api"
);
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;


function compareVersions(v1, v2) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }

  return 0;
}

function isVersionDeprecated(
  currentVersion,
  minimumVersion
) {
  return compareVersions(currentVersion, minimumVersion) < 0;
}

function readVersionCache() {
  if (fs.existsSync(VERSION_CACHE_FILE)) {
    const content = fs.readFileSync(VERSION_CACHE_FILE, "utf8");
    return JSON.parse(content);
  }
  return null;
}

function ensureOpenBugDir() {
    if (!fs.existsSync(OPENBUG_DIR)) {
    fs.mkdirSync(OPENBUG_DIR, { recursive: true });
  }
}

function writeVersionCache(cache) {
  ensureOpenBugDir();
  fs.writeFileSync(VERSION_CACHE_FILE, JSON.stringify(cache, null, 2));
}

function shouldCheckVersion() {
  const cache = readVersionCache();
  if (!cache || !cache.lastCheck) {
    return true;
  }

  const now = Date.now();
  const timeSinceLastCheck = now - cache.lastCheck;
  return timeSinceLastCheck >= CACHE_DURATION_MS;
}

const VERSION_CHECK_TIMEOUT_MS = 3000;

async function fetchMinimumVersion() {
  try {
    const response = await axios.get(`${API_BASE_URL}/health/minimum-cli-version`, {
      timeout: VERSION_CHECK_TIMEOUT_MS,
    });
    if (response.data?.success && response.data?.minimumCliVersion) {
      return response.data.minimumCliVersion;
    }
  } catch (error) {
    if (error.code !== "ECONNABORTED") {
      console.warn(
        "Failed to check CLI version:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
  return null;
}

function getCurrentVersion() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const possiblePaths = [
      path.resolve(__dirname, "../package.json"),
      path.resolve(__dirname, "../../package.json"),
    ];

    for (const pkgPath of possiblePaths) {
      if (fs.existsSync(pkgPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return pkgJson.version || "0.0.0";
      }
    }

    return "0.0.0";
  } catch (error) {
    return "0.0.0";
  }
}

function formatDeprecationError(
  currentVersion,
  minimumVersion
) {
  return `
⚠️  CLI VERSION DEPRECATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your current version: ${currentVersion}
Minimum required version: ${minimumVersion}

Please update to the latest version to continue using OpenBug CLI.

To update, run:
  npm install -g @openbug/cli@latest

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

export async function checkVersionCompatibility(
  forceCheck = false
) {
  const currentVersion = getCurrentVersion();
  const cache = readVersionCache();


  if (!forceCheck && cache?.lastCheck && !shouldCheckVersion()) {
    return true;
  }
  const minimumVersion = await fetchMinimumVersion();

  if (!minimumVersion) {
    return true;
  }

  writeVersionCache({
    lastCheck: Date.now(),
  });
  if (isVersionDeprecated(currentVersion, minimumVersion)) {
    console.error(formatDeprecationError(currentVersion, minimumVersion));
    return false;
  }

  return true;
}

export async function checkVersionAndExit() {
  const isCompatible = await checkVersionCompatibility(true);
  if (!isCompatible) {
    process.exit(1);
  }
}

async function fetchLatestVersionFromNpm(packageName) {
  try {
    const response = await axios.get(`https://registry.npmjs.org/${packageName}/latest`, {
      timeout: 5000, // 5 second timeout
    });
    return response.data?.version || null;
  } catch (error) {
    return null;
  }
}
function formatUpdateNotification(currentVersion, latestVersion, packageName) {
  return `
📦 Update Available
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your version: ${currentVersion}
Latest version: ${latestVersion}

To update, run:
  npm install -g ${packageName}@latest

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

export async function checkForUpdates(packageName = "@openbug/cli", forceCheck = false) {
  if (!forceCheck) {
    const cache = readVersionCache();
    if (cache?.lastUpdateCheck) {
      const now = Date.now();
      const timeSinceLastCheck = now - cache.lastUpdateCheck;
      if (timeSinceLastCheck < CACHE_DURATION_MS) {
        if (cache.lastKnownVersion) {
          const currentVersion = getCurrentVersion();
          if (compareVersions(currentVersion, cache.lastKnownVersion) >= 0) {
            return;
          }
        } else {
          return;
        }
      }
    }
  }

  try {
    const currentVersion = getCurrentVersion();
    const latestVersion = await fetchLatestVersionFromNpm(packageName);

    if (!latestVersion) {
      return;
    }

    const cache = readVersionCache() || {};
    writeVersionCache({
      ...cache,
      lastUpdateCheck: Date.now(),
      lastKnownVersion: latestVersion,
    });

    if (compareVersions(currentVersion, latestVersion) < 0) {
      console.warn(formatUpdateNotification(currentVersion, latestVersion, packageName));
    }
  } catch (error) {
  }
}

