import * as fs from "fs";
import * as path from "path";
import { config } from "./config.js";
import { logd } from "./helpers/cli-helpers.js";

// Message helpers use AI SDK CoreMessage; re-export from coreMessages
export {
  extractMessageContent,
  groupMessageChunks,
  cleanMessagesContent,
  getMessageKey,
  deduplicateMessages,
} from "./coreMessages.js";
export type { CoreMessage } from "./coreMessages.js";

//parameter to redis
export function getContextLines(
  fileName: string,
  lineNumber: number,
  before: number = 30,
  after: number = 30
): string {
  logd(`[getContextLines] 📥 Called with: fileName=${fileName}, lineNumber=${lineNumber}, before=${before}, after=${after}`);
  
  try {
    if (!fileName || typeof fileName !== "string") {
      logd(`[getContextLines] ❌ ERROR: Invalid fileName: ${fileName}`);
      return "";
    }

    if (typeof lineNumber !== "number" || lineNumber < 1) {
      logd(`[getContextLines] ❌ ERROR: Invalid lineNumber: ${lineNumber}`);
      return "";
    }

    const resolvedPath = path.resolve(fileName);
    logd(`[getContextLines] 📁 Path resolution: original=${fileName}, resolved=${resolvedPath}, exists=${fs.existsSync(fileName)}`);

    if (!fs.existsSync(fileName)) {
      logd(`[getContextLines] ❌ ERROR: File not found: ${fileName}`);
      logd(`[getContextLines] Attempted absolute path: ${resolvedPath}`);
      return "";
    }

    const stats = fs.statSync(fileName);
    logd(`[getContextLines] 📊 File stats: size=${stats.size}, isFile=${stats.isFile()}, isDirectory=${stats.isDirectory()}`);

    const fileContent = fs.readFileSync(fileName, "utf-8");
    logd(`[getContextLines] 📖 File read: contentLength=${fileContent.length}, hasContent=${fileContent.length > 0}`);

    const lines = fileContent.split("\n");
    const totalLines = lines.length;
    logd(`[getContextLines] 📝 File split: totalLines=${totalLines}`);

    const start = Math.max(0, lineNumber - before - 1);
    const end = Math.min(totalLines, lineNumber + after);
    
    logd(`[getContextLines] 🧮 Calculated indices: requestedLine=${lineNumber}, before=${before}, after=${after}, start=${start}, end=${end}, linesToExtract=${end - start}`);

    if (lineNumber > totalLines) {
      logd(`[getContextLines] ⚠️  WARNING: lineNumber (${lineNumber}) exceeds total lines (${totalLines})`);
    }

    if (lineNumber < 1) {
      logd(`[getContextLines] ⚠️  WARNING: lineNumber (${lineNumber}) is less than 1`);
    }

    const extractedLines = lines.slice(start, end);
    const result = extractedLines.join("\n");
    
    logd(`[getContextLines] ✅ Extraction complete: extractedLineCount=${extractedLines.length}, resultLength=${result.length}, firstLine=${extractedLines[0]?.substring(0, 50) || "(empty)"}, lastLine=${extractedLines[extractedLines.length - 1]?.substring(0, 50) || "(empty)"}`);

    return result;
  } catch (error) {
    logd(`[getContextLines] ❌ EXCEPTION: error=${error instanceof Error ? error.message : String(error)}, fileName=${fileName}, lineNumber=${lineNumber}`);
    return "";
  }
}

//redis connection
// const redisClient = createClient({
//   url: `rediss://${config.redis_username}:${config.redis_password}@${config.redis_host}:${config.redis_port}`,
//   socket: { tls: true },
// });

// redisClient.on("error", (err) => {
//   console.error("Redis Client Error", err);
// });

// redisClient.on("connect", () => {
//   console.log("Redis Client Connected");
// });

// redisClient.connect();

// export default redisClient;

function isIncompleteJSONChunk(content: string): boolean {
  if (typeof content !== "string") return false;
  const trimmed = content.trim();
  const hasJSONFields = trimmed.includes('"next"') || trimmed.includes('"message"');
  
  if (!hasJSONFields) {
    return false;
  }
  
  if (trimmed.startsWith("{") && !trimmed.endsWith("}")) {
    return true;
  }
  
  if (!trimmed.startsWith("{") && hasJSONFields) {
    return true;
  }
  
  if (trimmed.endsWith("}") && !trimmed.startsWith("{")) {
    return true;
  }
  
  return false;
}

function cleanMessageContent(content: string): string {
  if (typeof content !== "string") return content;
  
  const trimmed = content.trim();
  
  if (isIncompleteJSONChunk(trimmed)) {
    return "";
  }
  
  if ((trimmed.includes('"next"') || trimmed.includes('"message"')) && !trimmed.startsWith("{")) {
    if (trimmed.endsWith("}")) {
      return "";
    }
    if (trimmed.includes('":"') && (trimmed.includes('"next"') || trimmed.includes('"message"'))) {
      return "";
    }
  }
  
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
        return parsed.message;
      } else if (parsed && typeof parsed === "object") {
        return "";
      }
    } catch {
    }
  }
  
  const jsonMatch = trimmed.match(/\{[\s\S]*?"message"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
        return parsed.message;
      }
    } catch {
    }
  }
  
  return content;
}
