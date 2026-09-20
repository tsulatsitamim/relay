import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PREVIEW_BYTES, readFilePreview } from "../src/main/read-file.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "relay-read-"));
  dirs.push(root);
  writeFileSync(join(root, "a.ts"), "const a = 1;\n");
  writeFileSync(join(root, "bin.dat"), Buffer.from([1, 0, 2, 3]));
  writeFileSync(join(root, "big.txt"), "x".repeat(MAX_PREVIEW_BYTES + 100));
  mkdirSync(join(root, "src"));
  return root;
}

describe("readFilePreview", () => {
  it("reads a text file relative to the working directory", () => {
    expect(readFilePreview(fixture(), "a.ts")).toEqual({
      path: "a.ts",
      text: "const a = 1;\n",
      truncated: false,
      binary: false,
    });
  });

  it("flags binary files and returns no text", () => {
    expect(readFilePreview(fixture(), "bin.dat")).toEqual({
      path: "bin.dat",
      text: "",
      truncated: false,
      binary: true,
    });
  });

  it("truncates oversized files", () => {
    const result = readFilePreview(fixture(), "big.txt");
    expect(result?.truncated).toBe(true);
    expect(result?.text.length).toBe(MAX_PREVIEW_BYTES);
  });

  it("rejects paths outside the working directory and missing files", () => {
    const root = fixture();
    expect(readFilePreview(root, "../secret")).toBeNull();
    expect(readFilePreview(root, "/etc/passwd")).toBeNull();
    expect(readFilePreview(root, "nope.ts")).toBeNull();
    expect(readFilePreview(root, "src")).toBeNull();
  });
});
