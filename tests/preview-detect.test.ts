import { describe, expect, it } from "vitest";
import { detectLocalUrls, transcriptText, UrlStore } from "../src/main/preview-detect.ts";

describe("detectLocalUrls", () => {
  it("finds the vite and next banner shapes", () => {
    expect(detectLocalUrls("  ➜  Local:   http://localhost:5173/")).toEqual([
      "http://localhost:5173/",
    ]);
    expect(detectLocalUrls("- ready started server on 0.0.0.0:3000")).toEqual([]);
    expect(detectLocalUrls("ready - started server on http://127.0.0.1:3000")).toEqual([
      "http://127.0.0.1:3000/",
    ]);
  });

  it("finds a bare host and port and normalizes it to http", () => {
    expect(detectLocalUrls("listening on localhost:8080")).toEqual([
      "http://localhost:8080/",
    ]);
  });

  it("trims trailing punctuation and dedupes", () => {
    expect(
      detectLocalUrls("see http://localhost:5173/app, and http://localhost:5173/app again"),
    ).toEqual(["http://localhost:5173/app"]);
    expect(detectLocalUrls("(http://localhost:3000/)")).toEqual(["http://localhost:3000/"]);
  });

  it("ignores remote urls and non-http schemes", () => {
    expect(detectLocalUrls("deployed to https://relay.example.com/")).toEqual([]);
    expect(detectLocalUrls("file:///tmp/index.html")).toEqual([]);
    expect(detectLocalUrls("no urls here")).toEqual([]);
  });
});

describe("transcriptText", () => {
  it("collects url-bearing strings from any payload field", () => {
    const text = transcriptText([
      {
        id: "e1",
        kind: "agent_message",
        payload: { text: "dev server: http://localhost:5173/" },
      },
      {
        id: "e2",
        kind: "tool_call",
        payload: { content: [{ type: "text", text: "ready on localhost:4000" }] },
      },
    ]);
    expect(detectLocalUrls(text)).toEqual([
      "http://localhost:5173/",
      "http://localhost:4000/",
    ]);
  });
});

describe("UrlStore", () => {
  it("keeps the newest first, dedupes and reports a change once", () => {
    const store = new UrlStore();
    expect(store.list("s1")).toEqual([]);
    expect(store.add("s1", ["http://localhost:5173/"])).toEqual(["http://localhost:5173/"]);
    expect(store.add("s1", ["http://localhost:5173/"])).toBeNull();
    expect(store.add("s1", ["http://localhost:3000/"])).toEqual([
      "http://localhost:3000/",
      "http://localhost:5173/",
    ]);
    expect(store.list("s1")).toEqual(["http://localhost:3000/", "http://localhost:5173/"]);
  });

  it("caps at eight and isolates sessions", () => {
    const store = new UrlStore();
    for (let index = 0; index < 12; index += 1) {
      store.add("s1", [`http://localhost:${5000 + index}/`]);
    }
    expect(store.list("s1")).toHaveLength(8);
    expect(store.list("s1")[0]).toBe("http://localhost:5011/");
    expect(store.list("s2")).toEqual([]);
    store.remove("s1");
    expect(store.list("s1")).toEqual([]);
  });
});
