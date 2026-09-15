// @vitest-environment jsdom
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mimeForExt, readAttachment } from "../src/main/attachments.ts";
import { readImageFiles } from "../src/renderer/attachments.ts";

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

describe("readImageFiles", () => {
  it("reads image files to base64 attachments without the data prefix", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", {
      type: "image/png",
    });
    const picked = await readImageFiles([file]);
    expect(picked).toEqual([
      { name: "a.png", mimeType: "image/png", data: "AQID" },
    ]);
  });

  it("filters out non-image files", async () => {
    const notes = new File(["hello"], "notes.txt", { type: "text/plain" });
    const shot = new File([new Uint8Array([1])], "shot.png", {
      type: "image/png",
    });
    const picked = await readImageFiles([notes, shot]);
    expect(picked.map((a) => a.name)).toEqual(["shot.png"]);
  });

  it("skips files that exceed maxBytes", async () => {
    const big = new File([new Uint8Array(10)], "big.png", {
      type: "image/png",
    });
    const small = new File([new Uint8Array([1])], "small.png", {
      type: "image/png",
    });
    const picked = await readImageFiles([big, small], 5);
    expect(picked.map((a) => a.name)).toEqual(["small.png"]);
  });

  it("skips files that fail to read", async () => {
    const broken = { name: "bad.png", type: "image/png", size: 1 } as File;
    const picked = await readImageFiles([broken]);
    expect(picked).toEqual([]);
  });
});
