import githubLight from "highlight.js/styles/github.css?inline";
import githubDark from "highlight.js/styles/github-dark.css?inline";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME: ThemePreference = "system";
export const DEFAULT_CHAT_FONT_SIZE = 14;
export const CHAT_FONT_SIZES = [13, 14, 15, 16];

const THEME_VALUES: ThemePreference[] = ["system", "light", "dark"];
const CONVERSATION_FONT_SIZE = "--conversation-font-size";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_KEY = "relay.theme";
const CHAT_FONT_SIZE_KEY = "relay.chatFontSize";

type AppearanceStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type Appearance = {
  theme: ThemePreference;
  chatFontSize: number;
};

export function normalizeThemePreference(value: unknown): ThemePreference {
  return typeof value === "string" &&
    (THEME_VALUES as string[]).includes(value)
    ? (value as ThemePreference)
    : DEFAULT_THEME;
}

export function clampChatFontSize(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return DEFAULT_CHAT_FONT_SIZE;
  const clamped = Math.min(
    CHAT_FONT_SIZES[CHAT_FONT_SIZES.length - 1]!,
    Math.max(CHAT_FONT_SIZES[0]!, Math.round(numeric)),
  );
  return CHAT_FONT_SIZES.includes(clamped) ? clamped : DEFAULT_CHAT_FONT_SIZE;
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemDark ? "dark" : "light";
}

function defaultMatchMedia(): ((query: string) => MediaQueryList) | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof window.matchMedia !== "function") return undefined;
  return (query) => window.matchMedia(query);
}

export function applyAppearance(
  appearance: Appearance,
  deps?: {
    matchMedia?: (query: string) => MediaQueryList;
    root?: HTMLElement;
  },
): () => void {
  const root = deps?.root ?? document.documentElement;
  const matchMedia = deps?.matchMedia ?? defaultMatchMedia();
  const media =
    appearance.theme === "system" && matchMedia ? matchMedia(DARK_QUERY) : null;

  const apply = () => {
    const resolved = resolveTheme(appearance.theme, media?.matches ?? false);
    root.dataset.theme = resolved;
    root.style.setProperty(
      CONVERSATION_FONT_SIZE,
      `${appearance.chatFontSize}px`,
    );
  };

  apply();

  const onChange = () => apply();
  if (media && typeof media.addEventListener === "function") {
    media.addEventListener("change", onChange);
  }

  return () => {
    if (media && typeof media.removeEventListener === "function") {
      media.removeEventListener("change", onChange);
    }
  };
}

function defaultStorage(): AppearanceStorage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export function readCachedAppearance(
  storage?: AppearanceStorage,
): Appearance {
  const store = storage ?? defaultStorage();
  let theme: string | null = null;
  let chatFontSize: string | null = null;
  try {
    theme = store?.getItem(THEME_KEY) ?? null;
  } catch {
    theme = null;
  }
  try {
    chatFontSize = store?.getItem(CHAT_FONT_SIZE_KEY) ?? null;
  } catch {
    chatFontSize = null;
  }
  return {
    theme: normalizeThemePreference(theme),
    chatFontSize: clampChatFontSize(chatFontSize),
  };
}

export function cacheAppearance(
  appearance: Appearance,
  storage?: AppearanceStorage,
): void {
  const store = storage ?? defaultStorage();
  try {
    store?.setItem(THEME_KEY, appearance.theme);
    store?.setItem(CHAT_FONT_SIZE_KEY, String(appearance.chatFontSize));
  } catch {
    return;
  }
}

export function applyHighlightTheme(theme: ResolvedTheme, doc: Document): void {
  let style = doc.getElementById("hljs-theme") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "hljs-theme";
    doc.head.appendChild(style);
  }
  style.textContent = theme === "dark" ? githubDark : githubLight;
}