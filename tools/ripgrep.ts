import { RipGrep } from "./ripgrep-wrapper.js";

export interface RipgrepResult {
  filePath: string;
  line?: number | null;
  preview?: string;
  score?: number;
}

export interface RipgrepOptions {
  maxResults?: number;
  caseSensitive?: boolean;
  fileTypes?: string[]; // e.g., ['ts', 'js', 'tsx', 'jsx']
  excludePatterns?: string[]; // e.g., ['node_modules', '.git']
  workingDirectory?: string; // base directory to search from (defaults to process.cwd())
}

export async function ripgrepSearch(
  query: string,
  options: RipgrepOptions = {}
): Promise<RipgrepResult[]> {
  const defaultExcludePatterns = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".cache",
    "coverage",
    ".nyc_output",
    ".vscode",
    ".idea",
    "*.log",
    "*.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".env",
    ".env.*",
    "*.min.js",
    "*.min.css",
    ".DS_Store",
    "Thumbs.db",
  ];

  const {
    maxResults = 20,
    caseSensitive = false,
    fileTypes = [],
    excludePatterns = defaultExcludePatterns,
    workingDirectory,
  } = options;

  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchDir = workingDirectory || (typeof process !== "undefined" ? process.cwd() : undefined);
  if (!searchDir) {
    // console.error("[ripgrep] workingDirectory is required for client-side usage");
    return [];
  }

  try {
    let rg = new RipGrep(query, searchDir);

    rg.withFilename().lineNumber();

    if (!caseSensitive) {
      rg.ignoreCase();
    }

    if (fileTypes.length > 0) {
      for (const ext of fileTypes) {
        rg.glob(`*.${ext}`);
      }
    }

    for (const pattern of excludePatterns) {
      const hasFileExtension = /\.(json|lock|yaml|js|css|log)$/.test(pattern) || 
                               pattern.startsWith("*.") || 
                               pattern === ".env" || 
                               pattern.startsWith(".env.") ||
                               pattern === ".DS_Store" || 
                               pattern === "Thumbs.db";
      const isFilePattern = pattern.includes("*") || hasFileExtension;
      
      const excludePattern = isFilePattern ? `!${pattern}` : `!${pattern}/**`;
      rg.glob(excludePattern);
    }

    const runResult = await rg.run();
    const output = await runResult.asString();

    if (!output || output.trim().length === 0) {
      return [];
    }

    const lines = output.trim().split("\n");
    const results: RipgrepResult[] = [];

    for (const line of lines.slice(0, maxResults)) {
      const match = line.match(/^(.+?):(\d+):(.+)$/);
      if (match) {
        const [, filePath, lineNum, content] = match;
        const lineNumber = lineNum ? parseInt(lineNum, 10) : null;

        const preview = content ? content.trim().slice(0, 200) : undefined;

        results.push({
          filePath: filePath.trim(),
          line: lineNumber ?? null,
          preview: preview || undefined,
          score: 1.0,
        });
      }
    }

    return results;
  } catch (error: any) {
    if (
      error.message?.includes("No matches") ||
      error.message?.includes("not found") ||
      error.code === 1
    ) {
      return [];
    }

    // console.error("[ripgrep] Error executing ripgrep:", error.message);
    return [];
  }
}

export async function ripgrepSearchMultiple(
  queries: string[],
  options: RipgrepOptions = {}
): Promise<RipgrepResult[]> {
  const allResults: RipgrepResult[] = [];

  for (const query of queries) {
    const results = await ripgrepSearch(query, {
      ...options,
      maxResults: Math.ceil((options.maxResults || 20) / queries.length),
    });
    allResults.push(...results);
  }

  // Deduplicate by filePath:line
  const seen = new Set<string>();
  const unique: RipgrepResult[] = [];

  for (const result of allResults) {
    const key = `${result.filePath}:${result.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(result);
    }
  }

  return unique.slice(0, options.maxResults || 20);
}

