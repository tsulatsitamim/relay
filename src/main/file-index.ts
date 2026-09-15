import { readdirSync } from "node:fs";
import { join, posix } from "node:path";

const IGNORED = new Set([
  "node_modules",
  ".git",
  ".worktrees",
  "out",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".superpowers",
]);

export const MAX_VISITED = 5000;

export function shouldIgnore(name: string): boolean {
  return name.startsWith(".") || IGNORED.has(name);
}

export function listFiles(
  cwd: string,
  opts: { limit?: number; maxDepth?: number; maxVisited?: number } = {},
): string[] {
  const limit = opts.limit ?? 200;
  const maxDepth = opts.maxDepth ?? 6;
  const maxVisited = opts.maxVisited ?? MAX_VISITED;
  const files: string[] = [];
  let visited = 0;

  const walk = (dir: string, prefix: string, depth: number) => {
    if (depth > maxDepth || visited >= maxVisited) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (visited >= maxVisited) return;
      visited += 1;
      if (shouldIgnore(entry.name)) continue;
      const relative = prefix ? posix.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), relative, depth + 1);
      else if (entry.isFile()) files.push(relative);
    }
  };

  walk(cwd, "", 1);
  return files.sort().slice(0, limit);
}
