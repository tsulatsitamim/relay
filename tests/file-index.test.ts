import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listFiles, shouldIgnore } from "../src/main/file-index.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "relay-files-"));
  dirs.push(root);
  writeFileSync(join(root, "README.md"), "hi");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "index.ts"), "");
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "node_modules", "pkg.js"), "");
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, ".git", "config"), "");
  writeFileSync(join(root, ".env"), "SECRET=1");
  return root;
}

describe("shouldIgnore", () => {
  it("ignores dependency, vcs, and dotted entries", () => {
    expect(shouldIgnore("node_modules")).toBe(true);
    expect(shouldIgnore(".git")).toBe(true);
    expect(shouldIgnore(".env")).toBe(true);
    expect(shouldIgnore("src")).toBe(false);
  });
});

describe("listFiles", () => {
  it("lists files as relative posix paths and skips ignored trees", () => {
    const files = listFiles(fixture());
    expect(files).toContain("README.md");
    expect(files).toContain("src/index.ts");
    expect(files).not.toContain("node_modules/pkg.js");
    expect(files).not.toContain(".git/config");
    expect(files).not.toContain(".env");
  });

  it("returns a deterministic sorted prefix when limited", () => {
    expect(listFiles(fixture(), { limit: 1 })).toEqual(["README.md"]);
    expect(listFiles(fixture(), { limit: 2 })).toEqual([
      "README.md",
      "src/index.ts",
    ]);
  });

  it("bounds traversal with a visited cap", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-files-cap-"));
    dirs.push(root);
    for (const name of ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"]) {
      writeFileSync(join(root, name), "");
    }
    expect(listFiles(root, { maxVisited: 3 })).toEqual([
      "a.txt",
      "b.txt",
      "c.txt",
    ]);
    expect(listFiles(root, { maxVisited: 100 })).toEqual([
      "a.txt",
      "b.txt",
      "c.txt",
      "d.txt",
      "e.txt",
    ]);
  });
});
