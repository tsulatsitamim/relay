import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyLoginPath,
  mergePath,
  mergePaths,
  parseProbedPath,
} from "../src/main/path-env.ts";

describe("mergePaths", () => {
  it("keeps the first occurrence order and deduplicates", () => {
    expect(mergePaths(["/a:/b", "/b:/c", "/d"])).toBe("/a:/b:/c:/d");
  });

  it("ignores empty segments and missing entries", () => {
    expect(mergePaths(["", ":/a:", undefined])).toBe("/a");
  });
});

describe("mergePath", () => {
  it("puts login-shell dirs first and deduplicates", () => {
    expect(mergePath("/opt/homebrew/bin:/usr/bin", "/usr/bin:/usr/sbin")).toBe(
      "/opt/homebrew/bin:/usr/bin:/usr/sbin",
    );
  });
});

describe("parseProbedPath", () => {
  it("extracts the path between the sentinels, ignoring prompt noise", () => {
    const stdout =
      "\u001b]1337;CurrentDir=/repo\u0007__relay_path_begin__\n/a:/b\n__relay_path_end__\n";
    expect(parseProbedPath(stdout)).toBe("/a:/b");
  });

  it("returns empty when the sentinels are missing", () => {
    expect(parseProbedPath("no markers here")).toBe("");
  });
});

const onMac = process.platform === "darwin";

describe.skipIf(!onMac)("applyLoginPath", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("merges dirs added by .zshenv, .zprofile, and .zshrc", async () => {
    const home = mkdtempSync(join(tmpdir(), "relay-home-"));
    cleanup.push(home);
    const shellDir = join(home, "shell-bin");
    const profileDir = join(home, "profile-bin");
    const rcDir = join(home, "rc-bin");
    writeFileSync(join(home, ".zshenv"), `export PATH="${shellDir}:$PATH"\n`);
    writeFileSync(join(home, ".zprofile"), `export PATH="${profileDir}:$PATH"\n`);
    writeFileSync(join(home, ".zshrc"), `export PATH="${rcDir}:$PATH"\n`);

    const env = {
      HOME: home,
      USER: process.env.USER,
      LOGNAME: process.env.LOGNAME,
      TMPDIR: process.env.TMPDIR,
      SHELL: "/bin/zsh",
      PATH: "/usr/bin:/bin",
    };

    await applyLoginPath(env, "darwin");

    const parts = (env.PATH ?? "").split(":");
    expect(parts).toContain(rcDir);
    expect(parts).toContain(profileDir);
    expect(parts).toContain(shellDir);
  });
});
