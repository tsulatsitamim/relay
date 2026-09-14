import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import type { Repo } from "../shared/types.ts";

export function repoNameFromPath(path: string): string {
  return basename(path) || path;
}

export function withGitBranch(repo: Repo): Repo {
  try {
    const branch = execFileSync(
      "git",
      ["-C", repo.path, "rev-parse", "--abbrev-ref", "HEAD"],
      { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return { ...repo, branch: branch || null };
  } catch {
    return { ...repo, branch: null };
  }
}
