/**
 * AI SDK CoreMessage types and helpers for storage and display.
 * Use this for useWebSocket/start-ui; state is stored and rendered as CoreMessage[].
 */

import type { CoreMessage } from "ai";

export type { CoreMessage };

/** Flatten message content to a single string for display. */
function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: { type?: string; text?: string; toolName?: string }) => {
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      if (part?.type === "tool-call" && part.toolName) return `[Tool: ${part.toolName}]`;
      return "";
    })
    .filter(Boolean)
    .join("");
}

/** Unique key for a message (for grouping/dedup). Uses role + content hash; tool messages use toolCallId. */
export function getMessageKey(message: CoreMessage, index?: number): string {
  if (message.role === "tool" && Array.isArray(message.content) && message.content[0]) {
    const first = message.content[0] as { toolCallId?: string };
    if (first.toolCallId) return `tool_${first.toolCallId}`;
  }
  const raw = message.content as unknown;
  const content = contentToString(raw);
  const contentHash = content.length.toString();
  const prefix = content.slice(0, 50);
  return `${message.role}_${contentHash}_${prefix}_${index ?? ""}`;
}

/** Extract displayable text from an array of messages (e.g. a chunk). */
export function extractMessageContent(messages: CoreMessage[]): string {
  return messages
    .map((m) => contentToString(m.content))
    .filter(Boolean)
    .join("");
}

/** Clean string content in messages (strip incomplete JSON, etc.). Used by cleanMessagesContent. */
function cleanMessageContent(content: string): string {
  if (typeof content !== "string") return content;
  const trimmed = content.trim();
  if (trimmed.includes('"next"') || trimmed.includes('"message"')) {
    const jsonMatch = trimmed.match(/\{[\s\S]*?"message"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.message && typeof parsed.message === "string") return parsed.message;
      } catch {
        // ignore
      }
    }
  }
  return content;
}

/** Return messages with string content cleaned (for display). */
export function cleanMessagesContent(messages: CoreMessage[]): CoreMessage[] {
  return messages.map((msg) => {
    const c = msg.content;
    if (typeof c !== "string") return msg;
    const cleaned = cleanMessageContent(c);
    if (cleaned === c) return msg;
    return { ...msg, content: cleaned } as CoreMessage;
  });
}

/** Deduplicate by getMessageKey, keeping last occurrence. */
export function deduplicateMessages(messages: CoreMessage[]): CoreMessage[] {
  const map = new Map<string, CoreMessage>();
  const order: string[] = [];
  messages.forEach((msg, i) => {
    const key = getMessageKey(msg, i);
    if (!map.has(key)) order.push(key);
    map.set(key, msg);
  });
  return order.map((k) => map.get(k)!).filter(Boolean);
}

/** Group consecutive messages with the same key (for streaming chunks). */
export function groupMessageChunks(messages: CoreMessage[]): {
  lastId: string;
  messages: CoreMessage[][];
} {
  return messages.reduce(
    (prev, message, i) => {
      const key = getMessageKey(message, i);
      if (key !== prev.lastId) {
        prev.messages.push([message]);
        prev.lastId = key;
        return prev;
      }
      prev.messages[prev.messages.length - 1].push(message);
      return prev;
    },
    { lastId: "", messages: [] as CoreMessage[][] }
  );
}

/** Get display text for an assistant message, including thinkTool reflection if present. */
export function getAssistantDisplayContent(msg: CoreMessage): string {
  if (msg.role !== "assistant") return contentToString(msg.content);
  const content = msg.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  type Part = { type?: string; text?: string; toolName?: string; args?: unknown };
  const parts = content as Part[];
  const textParts = parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!);
  const toolCalls = parts.filter((p) => p.type === "tool-call");
  const firstTool = toolCalls[0];
  // Prefer final text (model's answer); only show "Calling: X" when there is no text yet (e.g. mid-stream).
  let combinedText = textParts.join("");
  if (firstTool?.toolName) combinedText += `\nCalling: ${firstTool.toolName}`;
  if (combinedText.length > 0) return combinedText;
  if (firstTool?.toolName === "thinkTool") {
    const args = firstTool.args as { reflection?: string } | undefined;
    if (typeof args?.reflection === "string") return args.reflection;
  }
  // if (firstTool?.toolName) return `Calling: ${firstTool.toolName}`;
  return "";
}
