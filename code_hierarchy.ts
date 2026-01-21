import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import ignore, { Ignore } from "ignore";

type FileNode = {
  name: string;
  type: "file" | "dir";
  children?: FileNode[];
};

function findRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const gi = path.join(current, ".gitignore");
    if (fs.existsSync(gi)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadIgnoreMatcher(root: string): Ignore {
  const ig: Ignore = (ignore as unknown as (o?: any) => Ignore)();
  const gitIgnorePath = path.join(root, ".gitignore");
  if (fs.existsSync(gitIgnorePath)) {
    const contents = fs.readFileSync(gitIgnorePath, "utf8");
    ig.add(contents);
  }
  ig.add(".git/");
  return ig;
}
function buildTree(root: string, dir: string, ig: Ignore): FileNode {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const children: FileNode[] = [];
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs);
    const relPosix = rel.replace(/\\/g, "/");
    if (e.isDirectory()) {
      const relDir = relPosix.endsWith("/") ? relPosix : relPosix + "/";
      if (ig.ignores(relDir)) continue;
      const child = buildTree(root, abs, ig);
      children.push({ name: e.name, type: "dir", children: child.children });
    } else if (e.isFile()) {
      if (ig.ignores(relPosix)) continue;
      children.push({ name: e.name, type: "file" });
    }
  }
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { name: path.basename(dir), type: "dir", children };
}

function toYaml(node: FileNode, indent: number = 0): string {
  const pad = "  ".repeat(indent);
  if (node.type === "file") {
    return `${pad}- ${node.name}`;
  }
  const header = `${pad}- ${node.name}/`;
  if (!node.children || node.children.length === 0) {
    return header;
  }
  const body = node.children
    .map((child) => toYaml(child, indent + 1))
    .join("\n");
  return `${header}\n${body}`;
}

export function generateYaml(startDir: string = process.cwd()): {
  yaml: string;
  root: string;
} {
  const repoRoot = findRoot(startDir) || startDir;
  const ig = loadIgnoreMatcher(repoRoot);
  const tree = buildTree(repoRoot, repoRoot, ig);
  const yaml = `project:\n${toYaml(tree, 1)}`;
  return { yaml, root: repoRoot };
}

const isDirectRun = (() => {
  try {
    const thisFile = path.resolve(fileURLToPath(import.meta.url));
    const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
    return thisFile === invoked;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  const start = process.cwd();
  const { yaml, root } = generateYaml(start);
  const outPath = path.join(root, "hierarchy.yaml");
  fs.writeFileSync(outPath, yaml + "\n", "utf8");
  console.log(`Hierarchy written to ${outPath}`);
}
