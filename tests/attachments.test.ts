import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mimeForExt, readAttachment } from "../src/main/attachments.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("mimeForExt", () => {
  it("maps common image extensions", () => {
    expect(mimeForExt("png")).toBe("image/png");
    expect(mimeForExt("JPG")).toBe("image/jpeg");
    expect(mimeForExt("webp")).toBe("image/webp");
    expect(mimeForExt("txt")).toBeNull();
  });
});

describe("readAttachment", () => {
  it("reads a file to a base64 attachment", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-att-"));
    dirs.push(root);
    const file = join(root, "shot.png");
    writeFileSync(file, Buffer.from([1, 2, 3]));
    const attachment = readAttachment(file);
    expect(attachment).toEqual({
      name: "shot.png",
      mimeType: "image/png",
      data: Buffer.from([1, 2, 3]).toString("base64"),
    });
  });

  it("returns null for a non-image file", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-att-"));
    dirs.push(root);
    const file = join(root, "notes.txt");
    writeFileSync(file, "hello");
    expect(readAttachment(file)).toBeNull();
  });
});
