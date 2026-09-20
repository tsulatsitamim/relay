import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import {
  branchFromPorcelain,
  mergeStats,
  parseNumstat,
  parsePorcelainV2,
  truncateDiffText,
  type GitChangesResult,
  type GitFileDiff,
} from "../shared/git.ts";
import { resolveWithinReal } from "./open-path.ts";

const execFileAsync = promisify(execFile);

export const GIT_TIMEOUT_MS = 5000;
export const MAX_DIFF_BYTES = 1024 * 1024;
const MAX_BUFFER = 8 * 1024 * 1024;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}

export async function gitRoot(cwd: string): Promise<string | null> {
  if (!cwd) return null;
  try {
    const root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    return root || null;
  } catch {
    return null;
  }
}

export async function gitChanges(cwd: string): Promise<GitChangesResult | null> {
  const root = await gitRoot(cwd);
  if (!root) return null;
  let status: string;
  try {
    status = await git(root, [
      "status",
      "--porcelain=v2",
      "-z",
      "--branch",
      "--untracked-files=all",
    ]);
  } catch {
    return null;
  }
  const files = parsePorcelainV2(status);
  let stats = new Map<string, { insertions: number; deletions: number }>();
  try {
    stats = parseNumstat(await git(root, ["diff", "--numstat", "-z", "HEAD"]));
  } catch {
    stats = new Map();
  }
  return { branch: branchFromPorcelain(status), files: mergeStats(files, stats) };
}

export async function gitFileDiff(
  cwd: string,
  path: string,
): Promise<GitFileDiff | null> {
  const root = await gitRoot(cwd);
  if (!root) return null;
  const resolved = resolveWithinReal(root, path);
  if (!resolved) return null;

  let oldText: string | null = null;
  try {
    oldText = await git(root, ["show", `HEAD:${path}`]);
  } catch {
    oldText = null;
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(resolved);
  } catch {
    buffer = Buffer.alloc(0);
  }

  if (buffer.length > MAX_DIFF_BYTES) {
    return { path, oldText: null, newText: "", truncated: true, binary: false };
  }
  if (buffer.includes(0) || (oldText ?? "").includes("\0")) {
    return { path, oldText: null, newText: "", truncated: false, binary: true };
  }

  const next = truncateDiffText(buffer.toString("utf8"));
  const previous = oldText == null ? null : truncateDiffText(oldText);
  return {
    path,
    oldText: previous ? previous.text : null,
    newText: next.text,
    truncated: next.truncated || (previous ? previous.truncated : false),
    binary: false,
  };
}
