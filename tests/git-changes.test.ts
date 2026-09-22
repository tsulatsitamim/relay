import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitChanges, gitFileDiff, gitRoot, MAX_DIFF_BYTES } from "../src/main/git-changes.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Relay Test",
      GIT_AUTHOR_EMAIL: "relay@test",
      GIT_COMMITTER_NAME: "Relay Test",
      GIT_COMMITTER_EMAIL: "relay@test",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "commit.gpgsign",
      GIT_CONFIG_VALUE_0: "false",
    },
  });
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "relay-git-"));
  dirs.push(root);
  git(root, ["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "keep.ts"), "export const keep = 1;\n");
  writeFileSync(join(root, "gone.ts"), "export const gone = 1;\n");
  writeFileSync(join(root, "moved.ts"), "export const moved = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

describe("gitRoot", () => {
  it("finds the repository root and reports non-repositories", async () => {
    const root = repo();
    expect(await gitRoot(join(root, "keep.ts"))).toBeNull();
    expect(await gitRoot(root)).toBeTruthy();
    const plain = mkdtempSync(join(tmpdir(), "relay-plain-"));
    dirs.push(plain);
    expect(await gitRoot(plain)).toBeNull();
  });
});

describe("gitChanges", () => {
  it("reports every working tree status with line counts", async () => {
    const root = repo();
    writeFileSync(join(root, "keep.ts"), "export const keep = 2;\n");
    writeFileSync(join(root, "added.ts"), "export const added = 1;\n");
    unlinkSync(join(root, "gone.ts"));
    renameSync(join(root, "moved.ts"), join(root, "renamed.ts"));
    git(root, ["add", "-A", "--", "moved.ts", "renamed.ts"]);
    writeFileSync(join(root, "loose.ts"), "export const loose = 1;\n");

    const result = await gitChanges(root);
    expect(result?.branch).toBe("main");
    const byPath = new Map(result!.files.map((file) => [file.path, file]));
    expect(byPath.get("keep.ts")).toMatchObject({ status: "modified", insertions: 1, deletions: 1 });
    expect(byPath.get("added.ts")).toMatchObject({ status: "untracked" });
    expect(byPath.get("gone.ts")).toMatchObject({ status: "deleted", deletions: 1 });
    expect(byPath.get("renamed.ts")).toMatchObject({ status: "renamed", oldPath: "moved.ts" });
  });

  it("carries the repository root so callers can resolve paths", async () => {
    const root = repo();
    const result = await gitChanges(root);
    expect(result?.root).toBe(realpathSync(root));
  });

  it("returns null outside a repository", async () => {
    const plain = mkdtempSync(join(tmpdir(), "relay-plain-"));
    dirs.push(plain);
    expect(await gitChanges(plain)).toBeNull();
  });
});

describe("gitFileDiff", () => {
  it("returns the committed and working copies of a modified file", async () => {
    const root = repo();
    writeFileSync(join(root, "keep.ts"), "export const keep = 2;\n");
    const diff = await gitFileDiff(root, "keep.ts");
    expect(diff?.oldText).toContain("keep = 1");
    expect(diff?.newText).toContain("keep = 2");
    expect(diff?.binary).toBe(false);
    expect(diff?.truncated).toBe(false);
  });

  it("returns an empty new side for a deleted file and no old side for a new one", async () => {
    const root = repo();
    unlinkSync(join(root, "gone.ts"));
    writeFileSync(join(root, "fresh.ts"), "export const fresh = 1;\n");
    expect((await gitFileDiff(root, "gone.ts"))?.newText).toBe("");
    expect((await gitFileDiff(root, "fresh.ts"))?.oldText).toBeNull();
  });

  it("reports a file too large to diff instead of loading it", async () => {
    const root = repo();
    writeFileSync(join(root, "huge.ts"), "x".repeat(MAX_DIFF_BYTES + 1));
    const diff = await gitFileDiff(root, "huge.ts");
    expect(diff).toEqual({
      path: "huge.ts",
      oldText: null,
      newText: "",
      truncated: true,
      binary: false,
    });
  });

  it("reports an oversized committed side instead of loading it", async () => {
    const root = repo();
    writeFileSync(join(root, "big.ts"), "y".repeat(MAX_DIFF_BYTES + 1));
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "big"]);
    writeFileSync(join(root, "big.ts"), "small\n");
    const diff = await gitFileDiff(root, "big.ts");
    expect(diff).toEqual({
      path: "big.ts",
      oldText: null,
      newText: "",
      truncated: true,
      binary: false,
    });
  });

  it("rejects escaped paths and files outside a repository", async () => {
    const root = repo();
    expect(await gitFileDiff(root, "../secret")).toBeNull();
    const plain = mkdtempSync(join(tmpdir(), "relay-plain-"));
    dirs.push(plain);
    writeFileSync(join(plain, "a.ts"), "a\n");
    expect(await gitFileDiff(plain, "a.ts")).toBeNull();
  });
});
