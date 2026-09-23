import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_TITLE,
  isLocalUrl,
  isPreviewId,
  normalizePreviewUrl,
  PREVIEW_PARTITION,
  previewTitleFromUrl,
} from "../src/shared/preview.ts";

const UUID = "2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";

describe("isPreviewId", () => {
  it("accepts a uuid id and rejects counters and non-strings", () => {
    expect(isPreviewId(`preview:${UUID}`)).toBe(true);
    expect(isPreviewId("preview:1")).toBe(false);
    expect(isPreviewId("terminal:1")).toBe(false);
    expect(isPreviewId(null)).toBe(false);
  });
});

describe("normalizePreviewUrl", () => {
  it("defaults a bare host and port to http", () => {
    expect(normalizePreviewUrl("localhost:5173")).toEqual({
      ok: true,
      url: "http://localhost:5173/",
    });
    expect(normalizePreviewUrl("  127.0.0.1:3000/app  ")).toEqual({
      ok: true,
      url: "http://127.0.0.1:3000/app",
    });
  });

  it("keeps an explicit scheme and accepts private and .local hosts", () => {
    expect(normalizePreviewUrl("https://localhost:5173/x")).toEqual({
      ok: true,
      url: "https://localhost:5173/x",
    });
    expect(normalizePreviewUrl("http://192.168.1.20:8080/")).toEqual({
      ok: true,
      url: "http://192.168.1.20:8080/",
    });
    expect(normalizePreviewUrl("http://dev-box.local:4000/")).toEqual({
      ok: true,
      url: "http://dev-box.local:4000/",
    });
    expect(normalizePreviewUrl("http://172.31.0.4:9000/")).toEqual({
      ok: true,
      url: "http://172.31.0.4:9000/",
    });
  });

  it("refuses remote hosts with a reason naming the host", () => {
    const refused = normalizePreviewUrl("https://example.com/");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain("example.com");
  });

  it("refuses non-http schemes, javascript and empty input", () => {
    expect(normalizePreviewUrl("file:///etc/passwd").ok).toBe(false);
    expect(normalizePreviewUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizePreviewUrl("   ").ok).toBe(false);
    expect(normalizePreviewUrl("http://172.15.0.4:9000/").ok).toBe(false);
    expect(normalizePreviewUrl("http://localhost:5173/a b").ok).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("answers for already-absolute urls", () => {
    expect(isLocalUrl("http://localhost:5173/")).toBe(true);
    expect(isLocalUrl("https://10.0.0.5/")).toBe(true);
    expect(isLocalUrl("https://example.com/")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });
});

describe("previewTitleFromUrl", () => {
  it("uses host and port, falling back to a generic label", () => {
    expect(previewTitleFromUrl("http://localhost:5173/")).toBe("localhost:5173");
    expect(previewTitleFromUrl("http://127.0.0.1:3000/app")).toBe("127.0.0.1:3000");
    expect(previewTitleFromUrl("")).toBe(DEFAULT_PREVIEW_TITLE);
  });
});

describe("constants", () => {
  it("names the partition and the cap", () => {
    expect(PREVIEW_PARTITION).toBe("persist:relay-preview");
    expect(DEFAULT_PREVIEW_TITLE).toBe("Preview");
  });
});
