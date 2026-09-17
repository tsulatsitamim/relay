import { basename, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import type { Repo } from "../shared/types.ts";

export type GitBranchInfo = {
  branch: string;
  worktree: boolean;
};

export function repoNameFromPath(path: string): string {
  return basename(path) || path;
}

function revParse(path: string, ...args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", path, "rev-parse", ...args], {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function branchInfo(path: string): GitBranchInfo | null {
  const branch = revParse(path, "--abbrev-ref", "HEAD");
  if (!branch) return null;
  const gitDir = revParse(path, "--git-dir");
  const commonDir = revParse(path, "--git-common-dir");
  const worktree =
    gitDir != null &&
    commonDir != null &&
    resolve(path, gitDir) !== resolve(path, commonDir);
  return { branch, worktree };
}

export function withGitBranch(repo: Repo): Repo {
  return { ...repo, branch: branchInfo(repo.path)?.branch ?? null };
}
