import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { branchInfo, withGitBranch } from "../src/main/repo-name.ts";

let hasGit = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  hasGit = false;
}

const temps: string[] = [];
function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("branchInfo", () => {
  it("returns null for a path that is not a git repository", () => {
    const dir = makeDir("relay-nonrepo-");
    expect(branchInfo(dir)).toBeNull();
  });

  it.skipIf(!hasGit)("resolves the branch and flags a linked worktree", () => {
    const repo = makeDir("relay-repo-");
    execFileSync("git", ["-C", repo, "init", "-q"], { stdio: "ignore" });
    execFileSync("git", ["-C", repo, "config", "user.email", "test@example.com"], {
      stdio: "ignore",
    });
    execFileSync("git", ["-C", repo, "config", "user.name", "Test"], {
      stdio: "ignore",
    });
    execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "init"], {
      stdio: "ignore",
    });

    const info = branchInfo(repo);
    expect(info).not.toBeNull();
    expect(info?.branch.length).toBeGreaterThan(0);
    expect(info?.worktree).toBe(false);

    const worktree = join(dirname(repo), `${basename(repo)}-wt`);
    temps.push(worktree);
    execFileSync(
      "git",
      ["-C", repo, "worktree", "add", "-q", worktree, "-b", "feature"],
      { stdio: "ignore" },
    );

    const linked = branchInfo(worktree);
    expect(linked?.branch).toBe("feature");
    expect(linked?.worktree).toBe(true);
  });
});

describe("withGitBranch", () => {
  it("returns a null branch when the path is not a git repository", () => {
    const dir = makeDir("relay-branchless-");
    expect(withGitBranch({ path: dir, name: "x", addedAt: 0 }).branch).toBeNull();
  });
});
