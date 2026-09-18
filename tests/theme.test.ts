// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_FONT_SIZES,
  DEFAULT_CHAT_FONT_SIZE,
  DEFAULT_THEME,
  applyAppearance,
  applyHighlightTheme,
  cacheAppearance,
  clampChatFontSize,
  normalizeThemePreference,
  readCachedAppearance,
  resolveTheme,
} from "../src/renderer/theme";

afterEach(() => {
  document.getElementById("hljs-theme")?.remove();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("--conversation-font-size");
  localStorage.clear();
});

type FakeMedia = {
  mql: MediaQueryList;
  listeners: Set<() => void>;
  fire: (matches: boolean) => void;
};

function fakeMedia(initial: boolean): FakeMedia {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initial,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  return {
    mql,
    listeners,
    fire: (matches: boolean) => {
      (mql as { matches: boolean }).matches = matches;
      for (const listener of listeners) listener();
    },
  };
}

function memoryStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  dump: () => Map<string, string>;
} {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    dump: () => map,
  };
}

describe("theme defaults and normalization", () => {
  it("exposes the documented defaults and font size scale", () => {
    expect(DEFAULT_THEME).toBe("system");
    expect(DEFAULT_CHAT_FONT_SIZE).toBe(14);
    expect(CHAT_FONT_SIZES).toEqual([13, 14, 15, 16]);
  });

  it("accepts only known theme preferences", () => {
    expect(normalizeThemePreference("system")).toBe("system");
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
  });

  it("falls back to system for garbage theme values", () => {
    for (const value of ["DARK", "", "midnight", null, undefined, 42, {}, []]) {
      expect(normalizeThemePreference(value)).toBe("system");
    }
  });

  it("clamps chat font sizes into the supported range", () => {
    expect(clampChatFontSize(13)).toBe(13);
    expect(clampChatFontSize(16)).toBe(16);
    expect(clampChatFontSize("15")).toBe(15);
    expect(clampChatFontSize(20)).toBe(16);
    expect(clampChatFontSize(8)).toBe(13);
    expect(clampChatFontSize(14.4)).toBe(14);
  });

  it("falls back to the default for garbage chat font sizes", () => {
    for (const value of ["large", "", null, undefined, {}, [], true, Number.NaN]) {
      expect(clampChatFontSize(value)).toBe(14);
    }
  });
});

describe("resolveTheme", () => {
  it("maps preferences and system darkness to a resolved theme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });
});

describe("applyAppearance", () => {
  it("sets the resolved theme and conversation font size on the root", () => {
    const cleanup = applyAppearance(
      { theme: "dark", chatFontSize: 15 },
      { root: document.documentElement, matchMedia: () => fakeMedia(false).mql },
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      document.documentElement.style.getPropertyValue("--conversation-font-size"),
    ).toBe("15px");
    cleanup();
  });

  it("treats a missing matchMedia as light in system mode", () => {
    const cleanup = applyAppearance(
      { theme: "system", chatFontSize: 14 },
      { root: document.documentElement, matchMedia: undefined },
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    cleanup();
  });

  it("re-applies when the system color scheme changes in system mode and detaches on cleanup", () => {
    const media = fakeMedia(false);
    const cleanup = applyAppearance(
      { theme: "system", chatFontSize: 14 },
      { root: document.documentElement, matchMedia: () => media.mql },
    );
    expect(document.documentElement.dataset.theme).toBe("light");

    media.fire(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    media.fire(false);
    expect(document.documentElement.dataset.theme).toBe("light");

    cleanup();
    expect(media.listeners.size).toBe(0);
    media.fire(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("does not subscribe to color scheme changes for an explicit theme", () => {
    const media = fakeMedia(true);
    const cleanup = applyAppearance(
      { theme: "dark", chatFontSize: 14 },
      { root: document.documentElement, matchMedia: () => media.mql },
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(media.listeners.size).toBe(0);
    cleanup();
  });
});

describe("applyHighlightTheme", () => {
  it("injects exactly one highlight style and swaps its contents per theme", () => {
    expect(document.querySelectorAll("#hljs-theme")).toHaveLength(0);

    applyHighlightTheme("light", document);
    expect(document.querySelectorAll("#hljs-theme")).toHaveLength(1);
    const light = document.getElementById("hljs-theme")?.textContent ?? "";
    expect(light).toContain(".hljs");

    applyHighlightTheme("dark", document);
    expect(document.querySelectorAll("#hljs-theme")).toHaveLength(1);
    const dark = document.getElementById("hljs-theme")?.textContent ?? "";
    expect(dark).toContain(".hljs");
    expect(dark).not.toBe(light);

    applyHighlightTheme("dark", document);
    expect(document.querySelectorAll("#hljs-theme")).toHaveLength(1);
    expect(document.getElementById("hljs-theme")?.textContent).toBe(dark);
  });
});

describe("appearance cache", () => {
  it("round-trips a valid appearance through storage", () => {
    const storage = memoryStorage();
    cacheAppearance({ theme: "dark", chatFontSize: 16 }, storage);

    expect(storage.dump().get("relay.theme")).toBe("dark");
    expect(storage.dump().get("relay.chatFontSize")).toBe("16");
    expect(readCachedAppearance(storage)).toEqual({
      theme: "dark",
      chatFontSize: 16,
    });
  });

  it("falls back to defaults for garbage cached values", () => {
    const storage = memoryStorage();
    storage.setItem("relay.theme", "neon");
    storage.setItem("relay.chatFontSize", "huge");

    expect(readCachedAppearance(storage)).toEqual({
      theme: "system",
      chatFontSize: 14,
    });
  });

  it("survives storage that throws", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("denied");
      }),
      setItem: vi.fn(() => {
        throw new Error("denied");
      }),
    };

    expect(readCachedAppearance(storage)).toEqual({
      theme: "system",
      chatFontSize: 14,
    });
    expect(() =>
      cacheAppearance({ theme: "light", chatFontSize: 13 }, storage),
    ).not.toThrow();
  });

  it("uses localStorage by default", () => {
    cacheAppearance({ theme: "light", chatFontSize: 13 });
    expect(localStorage.getItem("relay.theme")).toBe("light");
    expect(localStorage.getItem("relay.chatFontSize")).toBe("13");
    expect(readCachedAppearance()).toEqual({ theme: "light", chatFontSize: 13 });
  });
});