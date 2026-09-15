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

export function shouldIgnore(name: string): boolean {
  return name.startsWith(".") || IGNORED.has(name);
}

export function listFiles(
  cwd: string,
  opts: { limit?: number; maxDepth?: number } = {},
): string[] {
  const limit = opts.limit ?? 200;
  const maxDepth = opts.maxDepth ?? 6;
  const files: string[] = [];

  const walk = (dir: string, prefix: string, depth: number) => {
    if (depth > maxDepth || files.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (shouldIgnore(entry.name)) continue;
      const relative = prefix ? posix.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), relative, depth + 1);
      else if (entry.isFile()) files.push(relative);
    }
  };

  walk(cwd, "", 1);
  return files.sort();
}
