import { RipGrep } from "../tools/ripgrep-wrapper.js";
import { logd } from "./cli-helpers.js";
import fs from "fs";
import path from "path";

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

function looksLikeFilename(query: string): boolean {
  const trimmed = query.trim();

  if (!trimmed || trimmed.length === 0) return false;

  if (/\.\w{1,10}$/.test(trimmed)) return true;

  if (trimmed.includes("/") || trimmed.includes("\\")) return true;

  if (trimmed.startsWith(".")) return true;

  if (!trimmed.includes(" ") && trimmed.length >= 3 && trimmed.length <= 50) {
    if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return true;
    }
  }

  return false;
}

async function searchFilesByName(
  query: string,
  searchDir: string,
  options: RipgrepOptions
): Promise<RipgrepResult[]> {
  const {
    maxResults = 20,
    caseSensitive = false,
    excludePatterns = [],
  } = options;

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

  const allExcludePatterns = [...defaultExcludePatterns, ...excludePatterns];

  try {
    const escapedQuery = query.replace(/[\[\]{}()]/g, "\\$&");

    const globPattern = `**/*${escapedQuery}*`;

    logd(
      `[filenameSearch] Using ripgrep to search for files matching pattern: ${globPattern}`
    );
    let rg = new RipGrep(".", searchDir);
    rg.glob(globPattern);

    for (const pattern of allExcludePatterns) {
      const hasFileExtension =
        /\.(json|lock|yaml|js|css|log)$/.test(pattern) ||
        pattern.startsWith("*.") ||
        pattern === ".env" ||
        pattern.startsWith(".env.") ||
        pattern === ".DS_Store" ||
        pattern === "Thumbs.db";
      const isFilePattern = pattern.includes("*") || hasFileExtension;

      const excludePattern = isFilePattern ? `!${pattern}` : `!${pattern}/**`;
      rg.glob(excludePattern);
    }
    rg.withFilename().lineNumber();
    rg.fixedStrings();

    if (!caseSensitive) {
      rg.ignoreCase();
    }

    const runResult = await rg.run();
    const output = await runResult.asString();

    if (!output || output.trim().length === 0) {
      logd(`[filenameSearch] No files found matching pattern: ${globPattern}`);
      return [];
    }

    const lines = output.trim().split("\n");
    const filePaths = new Set<string>();
    const results: RipgrepResult[] = [];

    for (const line of lines) {
      if (results.length >= maxResults) break;
      const match = line.match(/^(.+?):(\d+):(.+)$/);
      if (match) {
        const filePath = match[1].trim();
        const relativePath = path.relative(searchDir, filePath);

        if (!filePaths.has(relativePath)) {
          filePaths.add(relativePath);

          const lineNumber = parseInt(match[2], 10) || 1;
          const preview =
            match[3]?.trim().slice(0, 200) ||
            `File: ${path.basename(filePath)}`;

          results.push({
            filePath: relativePath,
            line: lineNumber,
            preview: preview,
            score: 1.0,
          });
        }
      }
    }

    logd(
      `[filenameSearch] Found ${results.length} files matching pattern: ${globPattern}`
    );
    return results;
  } catch (error: any) {
    logd(
      `[filenameSearch] Error searching for files: ${error.message}, code: ${error.code}`
    );

    if (error.code === 1 || error.message?.includes("No matches")) {
      return [];
    }

    return [];
  }
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

  const searchDir =
    workingDirectory ||
    (typeof process !== "undefined" ? process.cwd() : undefined);
  if (!searchDir) {
    logd("[ripgrep] ERROR: workingDirectory is required for client-side usage");
    return [];
  }

  logd(
    `[ripgrep] Starting search: query=${query}, searchDir=${searchDir}, maxResults=${maxResults}, caseSensitive=${caseSensitive}, fileTypes=${JSON.stringify(
      fileTypes
    )}, excludePatterns=${JSON.stringify(excludePatterns.slice(0, 5))}`
  );

  try {
    let rg = new RipGrep(query, searchDir);

    rg.withFilename().lineNumber();

    rg.fixedStrings();

    if (!caseSensitive) {
      rg.ignoreCase();
    }

    if (fileTypes.length > 0) {
      for (const ext of fileTypes) {
        rg.glob(`*.${ext}`);
      }
    }

    for (const pattern of excludePatterns) {
      const hasFileExtension =
        /\.(json|lock|yaml|js|css|log)$/.test(pattern) ||
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

    logd(
      `[ripgrep] Raw output: outputLength=${
        output?.length || 0
      }, hasOutput=${!!(output && output.trim().length > 0)}, outputPreview=${
        output?.substring(0, 200) || "N/A"
      }`
    );

    if (!output || output.trim().length === 0) {
      logd("[ripgrep] ⚠️  No output from ripgrep - returning empty results");
      return [];
    }

    const lines = output.trim().split("\n");
    logd(
      `[ripgrep] Parsing output: totalLines=${lines.length}, firstLine=${
        lines[0]?.substring(0, 100) || "N/A"
      }`
    );

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
      } else {
        logd(
          `[ripgrep] ⚠️  Line didn't match expected format: line=${line.substring(
            0,
            100
          )}, lineLength=${line.length}`
        );
      }
    }

    logd(
      `[ripgrep] ✅ Parsed results: totalResults=${
        results.length
      }, results=${JSON.stringify(
        results.map((r) => ({
          filePath: r.filePath,
          line: r.line,
          previewLength: r.preview?.length || 0,
        }))
      )}`
    );

    const hasExactFilenameMatch = results.some((r) => {
      const fileName = path.basename(r.filePath);
      return fileName.toLowerCase() === query.toLowerCase();
    });

    if (looksLikeFilename(query) && (!hasExactFilenameMatch || results.length === 0)) {
      logd(
        `[ripgrep] 🔄 Content search ${results.length === 0 ? 'found no results' : `found ${results.length} results but no exact filename match`}, but query looks like filename. Trying filename search...`
      );
      const filenameResults = await searchFilesByName(
        query,
        searchDir,
        options
      );

      if (filenameResults.length > 0) {
        logd(
          `[ripgrep] ✅ Filename search found ${filenameResults.length} matches`
        );

        if (results.length > 0 && !hasExactFilenameMatch) {
          const combined = [...filenameResults, ...results];
          const unique = combined.filter((r, index, self) =>
            index === self.findIndex((t) => t.filePath === r.filePath)
          );
          return unique.slice(0, maxResults);
        }
        return filenameResults;
      } else {
        logd(`[ripgrep] ⚠️  Filename search also found no matches`);
      }
    }

    return results;
  } catch (error: any) {
    logd(
      `[ripgrep] ❌ Exception caught: error=${error.message}, code=${
        error.code
      }, stack=${error.stack?.substring(0, 200) || "N/A"}`
    );

    if (
      error.message?.includes("No matches") ||
      error.message?.includes("not found") ||
      error.code === 1
    ) {
      logd(
        "[ripgrep] ℹ️  No matches found (this is normal if search term doesn't exist)"
      );

      // Fallback to filename search if it looks like a filename
      if (looksLikeFilename(query)) {
        logd(
          `[ripgrep] 🔄 Error occurred, but query looks like filename. Trying filename search as fallback...`
        );
        try {
          const filenameResults = await searchFilesByName(
            query,
            searchDir,
            options
          );
          if (filenameResults.length > 0) {
            logd(
              `[ripgrep] ✅ Filename search fallback found ${filenameResults.length} matches`
            );
            return filenameResults;
          }
        } catch (fallbackError) {
          logd(
            `[ripgrep] ❌ Filename search fallback also failed: ${fallbackError}`
          );
        }
      }

      return [];
    }

    logd(`[ripgrep] Error executing ripgrep: ${error.message}`);
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
