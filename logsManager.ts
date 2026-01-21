/**
 * Singleton Logs Manager
 * Maintains logs data
 */
export class LogsManager {
  private static instance: LogsManager;
  private logs: string = "";

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): LogsManager {
    if (!LogsManager.instance) {
      LogsManager.instance = new LogsManager();
    }
    return LogsManager.instance;
  }

  /**
   * Append Logs
   * @param chunk
   */
  public addChunk(chunk: string): void {
    this.logs += chunk;
  }

  /**
   * Retrieves logs
   */
  public getLogs(): string {
    return this.logs;
  }

  public getTailLogs(n: number): string {
    const logs = this.getLogs() || "";
    const linesArr = logs.split("\n");
    const tail = linesArr.slice(-n).join("\n");
    return tail;
  }

  public getGrepLogs(pattern: string, before: number = 5, after: number = 5): string {
    const logs = this.getLogs() || "";
    if (!pattern || !pattern.trim()) {
      return "";
    }

    const lines = logs.split("\n");
    const normalizedPattern = pattern.toLowerCase();
    const beforeCount = before;
    const afterCount = after;

    const blocks: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes(normalizedPattern)) {
        const start = Math.max(0, i - beforeCount);
        const end = Math.min(lines.length, i + afterCount + 1);
        const contextBlock = lines.slice(start, end).join("\n");
        blocks.push(
          `block (match line ${i + 1}): ${contextBlock}`
        );
      }
    }

    if (blocks.length === 0) {
      return `No matches found for pattern "${pattern}" in logs.`;
    }

    return blocks.join("\n\n");
  }

  public getRecentErrors(n: number): string {
    const logs = this.getLogs() || "";
    const lines = logs.split("\n");
    const matched: string[] = [];

    if (!Number.isFinite(n) || n <= 0) {
      return "Invalid value for n. Please provide a positive number of error lines to fetch.";
    }

    const errorRegex = /\b(ERROR|ERR|FATAL|CRITICAL|WARN|WARNING|SEVERE|ALERT|PANIC|EMERGENCY)\b|(Exception|Unhandled|Uncaught|Traceback|stacktrace|Caused by:)|(TypeError|ReferenceError|RangeError|SyntaxError|RuntimeError|ValueError|NullPointerException|IllegalArgument)|(timeout|timed out|connection refused|connection reset|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN)|(HTTP\s(4\d\d|5\d\d)|\b5\d\d\b|\b429\b|\b503\b)|(OOM|out of memory|disk full|quota exceeded|rate limited|deadlock|segfault|SIGKILL|panic|crashed|crash)/i;

    for (let i = lines.length - 1; i >= 0 && matched.length < n; i--) {
      const line = lines[i];
      if (errorRegex.test(line)) {
        matched.push(line);
      }
    }

    if (matched.length === 0) {
      return "No recent error log lines found";
    }

    return matched.reverse().join("\n");
  }

  /**
   * Clear all logs
   */
  public clearAll(): void {
    this.logs = "";
  }
}

// Export the singleton instance
export default LogsManager.getInstance();
