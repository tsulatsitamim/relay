// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyRich, htmlFromNode } from "../src/renderer/rich-clipboard.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("htmlFromNode", () => {
  it("returns null for a null node", () => {
    expect(htmlFromNode(null)).toBeNull();
  });

  it("keeps text and markup", () => {
    const node = document.createElement("div");
    node.innerHTML = "<p>Hello <strong>world</strong></p>";
    expect(htmlFromNode(node)).toBe("<p>Hello <strong>world</strong></p>");
  });

  it("strips the footer, actions, controls and edit affordances", () => {
    const node = document.createElement("div");
    node.innerHTML = [
      '<div class="markdown"><p>Body</p><button>Copy</button><input value="x"><textarea>t</textarea></div>',
      '<div class="msg-foot"><div class="msg-actions"><button>Copy</button></div></div>',
      '<div class="msg-edit"><textarea>edit</textarea></div>',
    ].join("");
    const html = htmlFromNode(node);
    expect(html).toContain("<p>Body</p>");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("msg-foot");
    expect(html).not.toContain("msg-actions");
    expect(html).not.toContain("msg-edit");
  });
});

describe("copyRich", () => {
  it("writes rich html and text through ClipboardItem", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write } });
    const items: Record<string, Blob>[] = [];
    class FakeClipboardItem {
      constructor(record: Record<string, Blob>) {
        items.push(record);
      }
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);

    const ok = await copyRich("<b>hi</b>", "hi");

    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(items[0]!["text/html"]).toBeInstanceOf(Blob);
    expect(await items[0]!["text/html"]!.text()).toBe("<b>hi</b>");
    expect(await items[0]!["text/plain"]!.text()).toBe("hi");
  });

  it("falls back to writeText when the rich clipboard api is missing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const ok = await copyRich("<b>hi</b>", "hi");

    expect(ok).toBe(false);
    expect(writeText).toHaveBeenCalledWith("hi");
  });

  it("falls back to writeText when the rich write rejects", async () => {
    const write = vi.fn().mockRejectedValue(new Error("denied"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write, writeText } });
    class FakeClipboardItem {
      constructor(_record: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);

    const ok = await copyRich("<b>hi</b>", "hi");

    expect(ok).toBe(false);
    expect(writeText).toHaveBeenCalledWith("hi");
  });
});