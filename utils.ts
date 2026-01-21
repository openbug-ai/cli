import * as fs from "fs";
import * as path from "path";
import { config } from "./config.js";
import { logd } from "./helpers/cli-helpers.js";
import { BaseMessage } from "langchain";

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

export function cleanMessagesContent(messages: BaseMessage[]): BaseMessage[] {
  return messages.map(msg => {
    if (typeof msg.content === "string") {
      const cleaned = cleanMessageContent(msg.content);
      const cleanedMsg = { ...msg };
      (cleanedMsg as any).content = cleaned;
      return cleanedMsg as BaseMessage;
    }
    return msg;
  });
}

export function extractMessageContent(messages: BaseMessage[]): string {
  const fullContent = messages.reduce((prev, message) => {
    let content = message.content;
    if (typeof content === "string") {
      return prev + content;
    }
    return prev;
  }, "");
  
  if (typeof fullContent === "string") {
    const trimmed = fullContent.trim();
    
    if (isIncompleteJSONChunk(trimmed)) {
      return "";
    }
    
    if (trimmed.includes('"next"') || trimmed.includes('"message"')) {
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
      
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
            return parsed.message;
          } else if (parsed && typeof parsed === "object") {
            return "";
          }
        } catch {
          // Not valid JSON
        }
      }
    }
    return fullContent;
  }
  return fullContent;
}

/**
 * Get a unique key for a message for deduplication purposes
 * Uses message.id if available (string), otherwise checks other locations, then creates a fallback key
 */
export function getMessageKey(message: BaseMessage): string {
  // Priority 1: Check message.id if it's a string (unique ID)
  if (message.id && typeof message.id === "string") {
    return message.id;
  }
  
  // Priority 2: Check response_metadata.id (some messages store ID here)
  const msgAny = message as any;
  if (msgAny.response_metadata?.id && typeof msgAny.response_metadata.id === "string") {
    return msgAny.response_metadata.id;
  }
  
  // Priority 3: Check lc_kwargs.id (LangChain might preserve original kwargs)
  if (msgAny.lc_kwargs?.id && typeof msgAny.lc_kwargs.id === "string") {
    return msgAny.lc_kwargs.id;
  }
  
  // Priority 4: For ToolMessage, use tool_call_id as unique identifier
  const toolCallId = msgAny.tool_call_id;
  if (toolCallId && typeof toolCallId === "string") {
    return `tool_${toolCallId}`;
  }
  
  // Fallback: create a key from content + type + tool_call_id (if available)
  // This handles messages without IDs by creating a content-based key
  // NOTE: This could cause false duplicates if two different messages have same content
  const type = message.constructor.name || "Unknown";
  let content = "";
  if (typeof message.content === "string") {
    content = message.content.substring(0, 50);
  } else if (message.content !== undefined && message.content !== null) {
    const stringified = JSON.stringify(message.content);
    content = stringified ? stringified.substring(0, 50) : "";
  }
  
  // Include a hash of full content to reduce collisions
  const contentHash = typeof message.content === "string"
    ? message.content.length.toString()
    : "0";
  
  return `${type}_${contentHash}_${content}_${toolCallId || ""}`;
}

/**
 * Deduplicate messages array by message ID, keeping the last occurrence
 * Preserves message order
 */
export function deduplicateMessages(messages: BaseMessage[]): BaseMessage[] {
  const messageMap = new Map<string, BaseMessage>();
  const order: string[] = [];
  
  messages.forEach((msg) => {
    const key = getMessageKey(msg);
    if (!messageMap.has(key)) {
      order.push(key);
    }
    // Keep the last occurrence of messages with the same ID
    messageMap.set(key, msg);
  });
  
  // Return messages in original order, but deduplicated
  return order.map((key) => messageMap.get(key)!).filter(Boolean);
}

export function groupMessageChunks(messages: BaseMessage[]): {
  lastId: string;
  messages: BaseMessage[][];
} {
  return messages.reduce(
    (
      prev: { lastId: string; messages: BaseMessage[][] },
      message: BaseMessage
    ) => {
      if (!prev) prev = { lastId: "", messages: [] };

      const messageKey = getMessageKey(message);
      if (messageKey !== prev.lastId) {
        prev.messages.push([message]);
        prev.lastId = messageKey;
        return prev;
      } else {
      }

      const lastMessageIndex = prev.messages.length - 1;

      prev.messages[lastMessageIndex].push(message);
      return prev;
    },
    { lastId: "", messages: [] }
  );
}
