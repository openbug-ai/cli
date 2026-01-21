import { spawn } from "child_process";

let rgPathCache: string | null = null;

async function getRgPath(): Promise<string> {
  if (rgPathCache === null) {
    const { rgPath } = await import("@vscode/ripgrep");
    rgPathCache = rgPath;
  }
  return rgPathCache;
}

export class RipGrep {
  private query: string;
  private searchDir: string;
  private args: string[] = [];

  constructor(query: string, searchDir: string) {
    this.query = query;
    this.searchDir = searchDir;
  }

  withFilename(): this {
    this.args.push("--with-filename");
    return this;
  }

  lineNumber(): this {
    this.args.push("--line-number");
    return this;
  }

  ignoreCase(): this {
    this.args.push("--ignore-case");
    return this;
  }

  glob(pattern: string): this {
    this.args.push("--glob", pattern);
    return this;
  }

  fixedStrings(): this {
    this.args.push("--fixed-strings");
    return this;
  }

  async run(): Promise<{ asString: () => Promise<string> }> {
    const allArgs = [
      ...this.args,
      this.query,
      this.searchDir,
    ];

    return {
      asString: async (): Promise<string> => {
        const rgPath = await getRgPath();
        return new Promise((resolve, reject) => {
          const rgProcess = spawn(rgPath, allArgs, {
            cwd: this.searchDir,
            stdio: ["ignore", "pipe", "pipe"],
          });

          let stdout = "";
          let stderr = "";

          rgProcess.stdout.on("data", (data) => {
            stdout += data.toString();
          });

          rgProcess.stderr.on("data", (data) => {
            stderr += data.toString();
          });

          rgProcess.on("close", (code) => {
            if (code === 0 || code === 1) {
              resolve(stdout);
            } else {
              reject(new Error(`ripgrep exited with code ${code}: ${stderr || stdout}`));
            }
          });

          rgProcess.on("error", (error) => {
            reject(error);
          });
        });
      },
    };
  }
}

