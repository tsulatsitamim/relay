import { describe, expect, it } from "vitest";
import {
  clampPanelWidth,
  clearWidth,
  MIN_CHAT_WIDTH,
  MIN_PANEL_WIDTH,
  parsePanels,
  readPanels,
  serializePanels,
  shouldOverlayPanel,
  writePanels,
  readWidth,
  writeWidth,
} from "../src/renderer/right-panel/persist.ts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("parsePanels", () => {
  it("returns an empty record for junk input", () => {
    expect(parsePanels(null)).toEqual({});
    expect(parsePanels("{oops")).toEqual({});
    expect(parsePanels("[]")).toEqual({});
    expect(parsePanels('{"version":1,"bySession":[]}')).toEqual({});
  });

  it("keeps known surfaces and drops unknown ones", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "changes",
            surfaces: [
              { id: "changes", kind: "changes" },
              { id: "bogus", kind: "bogus" },
              { id: "files", kind: "files" },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      { id: "changes", kind: "changes" },
      { id: "files", kind: "files" },
    ]);
  });

  it("keeps a well-formed terminal surface and drops malformed ones", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
            surfaces: [
              {
                id: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
                kind: "terminal",
                title: "Terminal 1",
              },
              { id: "terminal:1", kind: "terminal", title: "counter id" },
              { id: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b", kind: "terminal" },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      {
        id: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
        kind: "terminal",
        title: "Terminal 1",
      },
    ]);
  });

  it("keeps a well-formed preview surface and drops remote or malformed ones", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
            surfaces: [
              {
                id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
                kind: "preview",
                title: "localhost:5173",
                url: "localhost:5173",
              },
              { id: "preview:1", kind: "preview", title: "counter", url: "" },
              { id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b", kind: "preview", title: "x" },
              {
                id: "preview:3f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
                kind: "preview",
                title: "remote",
                url: "https://example.com/",
              },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      {
        id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
        kind: "preview",
        title: "localhost:5173",
        url: "http://localhost:5173/",
      },
    ]);
  });

  it("drops a file surface without a path and normalizes its numbers", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "file:src/a.ts",
            surfaces: [
              { id: "file:x", kind: "file" },
              {
                id: "file:src/a.ts",
                kind: "file",
                path: "src/a.ts",
                revealLine: -4,
                revealRequestId: -2,
              },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      {
        id: "file:src/a.ts",
        kind: "file",
        path: "src/a.ts",
        revealLine: null,
        revealRequestId: 0,
      },
    ]);
  });

  it("repairs a dangling activeSurfaceId and never reopens an empty panel", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: { isOpen: true, activeSurfaceId: "gone", surfaces: [{ id: "plan", kind: "plan" }] },
          s2: { isOpen: true, activeSurfaceId: "plan", surfaces: [] },
        },
      }),
    );
    expect(panels.s1!.activeSurfaceId).toBe("plan");
    expect(panels.s2).toBeUndefined();
  });

  it("round trips through storage", () => {
    const storage = memoryStorage();
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: { s1: { isOpen: true, activeSurfaceId: "plan", surfaces: [{ id: "plan", kind: "plan" }] } },
      }),
    );
    writePanels(storage, panels);
    expect(readPanels(storage)).toEqual(panels);
    expect(serializePanels(panels)).toContain('"version":1');
  });
});

describe("clampPanelWidth", () => {
  it("keeps a preferred width that fits", () => {
    expect(clampPanelWidth(540, 1600, 1200)).toBe(540);
  });

  it("caps at 70% of the viewport", () => {
    expect(clampPanelWidth(2000, 1000, 4000)).toBe(700);
  });

  it("reserves 360px for the chat column", () => {
    expect(clampPanelWidth(2000, 4000, 1000)).toBe(640);
  });

  it("never goes below the minimum", () => {
    expect(clampPanelWidth(100, 4000, 4000)).toBe(360);
    expect(clampPanelWidth(Number.NaN, 4000, 4000)).toBe(540);
  });
});

describe("shouldOverlayPanel", () => {
  it("stays inline while the container can hold the panel and the chat minimum", () => {
    expect(shouldOverlayPanel(MIN_PANEL_WIDTH + MIN_CHAT_WIDTH, 1600)).toBe(false);
    expect(shouldOverlayPanel(1200, 1600)).toBe(false);
    expect(shouldOverlayPanel(720, 980)).toBe(false);
  });

  it("overlays once the width clamp collapses", () => {
    expect(shouldOverlayPanel(MIN_PANEL_WIDTH + MIN_CHAT_WIDTH - 1, 1600)).toBe(true);
    expect(shouldOverlayPanel(700, 980)).toBe(true);
  });

  it("falls back to the viewport when the container is unmeasured", () => {
    expect(shouldOverlayPanel(null, 1600)).toBe(false);
    expect(shouldOverlayPanel(0, 700)).toBe(true);
    expect(shouldOverlayPanel(null, MIN_PANEL_WIDTH + MIN_CHAT_WIDTH - 1)).toBe(true);
  });
});

describe("width storage", () => {
  it("round trips a width and rejects junk", () => {
    const storage = memoryStorage();
    expect(readWidth(storage, "s1")).toBeNull();
    writeWidth(storage, "s1", 611.7);
    expect(readWidth(storage, "s1")).toBe(611);
    storage.setItem("relay.rightPanelWidth:s2", "nope");
    expect(readWidth(storage, "s2")).toBeNull();
  });

  it("clears a stored width", () => {
    const storage = memoryStorage();
    writeWidth(storage, "s1", 611);
    clearWidth(storage, "s1");
    expect(readWidth(storage, "s1")).toBeNull();
  });
});
