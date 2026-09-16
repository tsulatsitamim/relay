import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const GLOBAL_ROOTS = [
  [".claude", "skills"],
  [".agents", "skills"],
  [".config", "opencode", "skills"],
  [".config", "opencode", "skill"],
];

const PROJECT_ROOTS = [
  [".claude", "skills"],
  [".agents", "skills"],
  [".opencode", "skills"],
  [".opencode", "skill"],
];

const MAX_DEPTH = 3;

const cache = new Map<string, string[]>();

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasSkillFile(path: string): boolean {
  try {
    return statSync(join(path, "SKILL.md")).isFile();
  } catch {
    return false;
  }
}

function walk(root: string, depth: number, into: Set<string>): void {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = join(root, name);
    if (!isDir(dir)) continue;
    if (hasSkillFile(dir)) {
      into.add(name);
      continue;
    }
    if (depth < MAX_DEPTH) walk(dir, depth + 1, into);
  }
}

export function listSkills(opts: { home?: string; cwd?: string } = {}): string[] {
  const home = opts.home ?? homedir();
  const cwd = opts.cwd;
  const key = `${home}\u0000${cwd ?? ""}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const names = new Set<string>();
  for (const parts of GLOBAL_ROOTS) walk(join(home, ...parts), 1, names);
  if (cwd) {
    for (const parts of PROJECT_ROOTS) walk(join(cwd, ...parts), 1, names);
  }

  const result = [...names].sort();
  cache.set(key, result);
  return result;
}
