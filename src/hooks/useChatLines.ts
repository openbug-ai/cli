import { useMemo } from "react";
import stringWidth from "string-width";
import { marked } from "marked";
import type { CoreMessage } from "../../coreMessages.js";
import {
  extractMessageContent,
  groupMessageChunks,
  getAssistantDisplayContent,
} from "../../coreMessages.js";

function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (stringWidth(testLine) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [""];
}

type UseChatLinesArgs = {
  messages: CoreMessage[];
  terminalCols: number;
};

type UseChatLinesResult = {
  lines: { key: string; text: string; isHuman: boolean }[];
  toolStatus: string | null;
};

export function useChatLines({
  messages,
  terminalCols,
}: UseChatLinesArgs): UseChatLinesResult {
  return useMemo<UseChatLinesResult>(() => {
    if (!messages?.length) {
      return { lines: [], toolStatus: null };
    }

    const availableWidth = terminalCols - 4;
    const groupedMessages = groupMessageChunks(messages).messages;
    let currentTool: string | null = null;

    const allLines = groupedMessages.flatMap((msgs, index) => {
      const first = msgs[0];
      const isHuman = first.role === "user";

      const prefix = isHuman ? "" : "⏺ ";
      const prefixWidth = stringWidth(prefix);

      const content =
        first.role === "assistant"
          ? getAssistantDisplayContent(first)
          : extractMessageContent(msgs);

      if (first.role === "assistant" && typeof first.content !== "string") {
        const parts = Array.isArray(first.content) ? first.content : [];
        const toolCall = parts.find((p: { type?: string }) => p.type === "tool-call") as { toolName?: string } | undefined;
        if (toolCall?.toolName) currentTool = toolCall.toolName;
      }

      if (!content) return [];

      const rendered = marked.parse(content) as string;
      const renderedLines = rendered.split("\n");

      if (isHuman) {
        return [
          {
            key: `chat-${index}-human`,
            text: renderedLines.join("\n"),
            isHuman: true,
          },
        ];
      }

      const lines = renderedLines.flatMap((line, lineIndex) => {
        const fullLine =
          lineIndex === 0 ? prefix + line : " ".repeat(prefixWidth) + line;

        return wrapText(fullLine, availableWidth).map((wrapped, wrapIndex) => ({
          key: `chat-${index}-${lineIndex}-${wrapIndex}`,
          text: wrapped,
          isHuman: false,
        }));
      });

      lines.push({
        key: `chat-${index}-spacer`,
        text: " ",
        isHuman: false,
      });

      return lines;
    });

    return { lines: allLines, toolStatus: currentTool };
  }, [messages, terminalCols]);
}
