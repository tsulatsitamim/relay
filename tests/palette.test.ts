import { describe, expect, it } from "vitest";
import {
  fuzzyScore,
  paletteSessionEntries,
  rankEntries,
  type PaletteEntry,
} from "../src/renderer/palette.ts";
import type { Session, TranscriptEvent } from "../src/shared/types.ts";

function entry(overrides: Partial<PaletteEntry> = {}): PaletteEntry {
  return { id: "x", group: "Commands", label: "x", ...overrides };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    title: "Session one",
    agentConfigId: "a1",
    agentName: "Fake",
    workingDirectory: "/tmp/repo",
    status: "idle",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("fuzzyScore", () => {
  it("matches a case-insensitive subsequence", () => {
    expect(fuzzyScore("nc", "New Chat")).not.toBeNull();
    expect(fuzzyScore("NC", "new chat")).not.toBeNull();
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyScore("xyz", "New Chat")).toBeNull();
    expect(fuzzyScore("cn", "New Chat")).toBeNull();
  });

  it("treats an empty query as matching everything", () => {
    expect(fuzzyScore("", "New Chat")).toBe(0);
  });

  it("scores contiguous and prefix matches above scattered ones", () => {
    const contiguous = fuzzyScore("chat", "Chat")!;
    const scattered = fuzzyScore("chat", "c-h-a-t")!;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("prefers the shorter target when everything else is equal", () => {
    expect(fuzzyScore("init", "/init")!).toBeGreaterThan(fuzzyScore("init", "/initialize")!);
  });
});

describe("rankEntries", () => {
  const entries = [
    entry({ id: "a", label: "Open settings" }),
    entry({ id: "b", label: "New chat" }),
    entry({ id: "c", label: "Find in conversation" }),
  ];

  it("returns the input order for an empty query", () => {
    expect(rankEntries("", entries).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("filters out non-matching entries", () => {
    expect(rankEntries("chat", entries).map((item) => item.id)).toEqual(["b"]);
  });

  it("preserves extra fields on ranked entries", () => {
    const withShortcut = [entry({ id: "b", label: "New chat", shortcut: "mod+n" })];
    expect(rankEntries("chat", withShortcut)[0]?.shortcut).toBe("mod+n");
  });
});

describe("paletteSessionEntries", () => {
  const events: TranscriptEvent[] = [
    { id: "e1", kind: "agent_message", payload: { text: "token refresh logic" } },
  ];

  it("matches sessions on the title", () => {
    const ids = paletteSessionEntries("one", [session()], {}).map((item) => item.id);
    expect(ids).toEqual(["s1"]);
  });

  it("matches sessions on transcript content when the title does not", () => {
    const ids = paletteSessionEntries("refresh", [session()], { s1: events }).map(
      (item) => item.id,
    );
    expect(ids).toEqual(["s1"]);
  });

  it("ranks title matches above content-only matches", () => {
    const title = session({ id: "title", title: "Refresh tokens" });
    const content = session({ id: "content", title: "Some chat" });
    const ids = paletteSessionEntries("refresh", [content, title], {
      content: events,
    }).map((item) => item.id);
    expect(ids).toEqual(["title", "content"]);
  });

  it("excludes archived sessions and carries a hint", () => {
    const archived = session({ id: "archived", title: "Refresh old", archived: true });
    const live = session({ id: "live", title: "Refresh now" });
    const entries = paletteSessionEntries("refresh", [archived, live], {});
    expect(entries.map((item) => item.id)).toEqual(["live"]);
    expect(entries[0]?.hint).toBe("Fake");
  });

  it("returns every live session for an empty query", () => {
    const entries = paletteSessionEntries("", [session(), session({ id: "s2" })], {});
    expect(entries.map((item) => item.id)).toEqual(["s1", "s2"]);
  });
});
