// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeThumb, withThumbs } from "../src/renderer/thumbs.ts";
import type { PromptAttachment } from "../src/shared/types.ts";

const RealImage = globalThis.Image;

afterEach(() => {
  globalThis.Image = RealImage;
  vi.restoreAllMocks();
});

function stubImage(outcome: "load" | "error", width = 1024, height = 768) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = width;
    height = height;
    set src(_value: string) {
      queueMicrotask(() => {
        if (outcome === "load") this.onload?.();
        else this.onerror?.();
      });
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
}

function stubCanvas(toDataUrl: string | null, withContext = true) {
  const ctx = { drawImage: vi.fn() };
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getContext",
  ).mockImplementation(
    (() => (withContext ? ctx : null)) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "toDataURL",
  ).mockImplementation(
    (() => (toDataUrl as string)) as unknown as typeof HTMLCanvasElement.prototype.toDataURL,
  );
  return { ctx };
}

describe("makeThumb", () => {
  it("downscales a loaded image to a jpeg data url", async () => {
    stubImage("load", 1024, 768);
    const { ctx } = stubCanvas("data:image/jpeg;base64,thumb");
    const result = await makeThumb("data:image/png;base64,AAAA", 64);
    expect(result).toBe("data:image/jpeg;base64,thumb");
    const call = ctx.drawImage.mock.calls[0] as unknown as number[];
    expect(call.slice(1)).toEqual([0, 0, 64, 48]);
  });

  it("returns undefined when the image fails to load", async () => {
    stubImage("error");
    stubCanvas("data:image/jpeg;base64,thumb");
    await expect(makeThumb("data:invalid")).resolves.toBeUndefined();
  });

  it("returns undefined when a canvas context is unavailable", async () => {
    stubImage("load");
    stubCanvas("data:image/jpeg;base64,thumb", false);
    await expect(makeThumb("data:image/png;base64,AAAA")).resolves.toBeUndefined();
  });
});

describe("withThumbs", () => {
  it("adds a thumbnail to each attachment", async () => {
    stubImage("load", 32, 32);
    stubCanvas("data:image/jpeg;base64,thumb");
    const attachments: PromptAttachment[] = [
      { name: "a.png", mimeType: "image/png", data: "AAAA" },
    ];
    await expect(withThumbs(attachments)).resolves.toEqual([
      {
        name: "a.png",
        mimeType: "image/png",
        data: "AAAA",
        thumb: "data:image/jpeg;base64,thumb",
      },
    ]);
  });

  it("keeps attachments unchanged and never throws when thumbnails fail", async () => {
    stubImage("error");
    stubCanvas("data:image/jpeg;base64,thumb");
    const attachments: PromptAttachment[] = [
      { name: "bad.png", mimeType: "image/png", data: "AAAA" },
    ];
    const result = await withThumbs(attachments);
    expect(result).toEqual(attachments);
    expect(result[0]?.thumb).toBeUndefined();
  });
});
