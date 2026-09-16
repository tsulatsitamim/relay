import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveWithin, resolveWithinReal } from "../src/main/open-path.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-open-"));
  dirs.push(dir);
  return dir;
}

describe("resolveWithin", () => {
  it("joins a relative path against the cwd", () => {
    expect(resolveWithin("/tmp/repo", "src/a.ts")).toBe("/tmp/repo/src/a.ts");
  });

  it("accepts an absolute path that stays inside the cwd", () => {
    expect(resolveWithin("/tmp/repo", "/tmp/repo/src/a.ts")).toBe(
      "/tmp/repo/src/a.ts",
    );
  });

  it("refuses a parent traversal", () => {
    expect(resolveWithin("/tmp/repo", "../secret.txt")).toBeNull();
    expect(resolveWithin("/tmp/repo", "src/../../secret.txt")).toBeNull();
  });

  it("refuses an absolute path outside the cwd", () => {
    expect(resolveWithin("/tmp/repo", "/etc/passwd")).toBeNull();
  });

  it("refuses an empty cwd", () => {
    expect(resolveWithin("", "src/a.ts")).toBeNull();
  });
});

describe("resolveWithinReal", () => {
  it("accepts a real file inside the cwd", () => {
    const root = temp();
    const cwd = join(root, "cwd");
    mkdirSync(cwd);
    writeFileSync(join(cwd, "a.ts"), "x");
    expect(resolveWithinReal(cwd, "a.ts")).toBe(realpathSync(join(cwd, "a.ts")));
  });

  it("refuses a symlink inside the cwd that points outside", () => {
    const root = temp();
    const cwd = join(root, "cwd");
    mkdirSync(cwd);
    const secret = join(root, "secret.txt");
    writeFileSync(secret, "top");
    const link = join(cwd, "link.txt");
    try {
      symlinkSync(secret, link);
    } catch {
      return;
    }
    expect(resolveWithin(cwd, "link.txt")).not.toBeNull();
    expect(resolveWithinReal(cwd, "link.txt")).toBeNull();
  });

  it("falls back to the lexical result when the target does not exist", () => {
    const root = temp();
    const cwd = join(root, "cwd");
    mkdirSync(cwd);
    expect(resolveWithinReal(cwd, "new.ts")).toBe(resolveWithin(cwd, "new.ts"));
  });

  it("still refuses a lexical parent traversal", () => {
    const root = temp();
    const cwd = join(root, "cwd");
    mkdirSync(cwd);
    expect(resolveWithinReal(cwd, "../secret.txt")).toBeNull();
  });
});
