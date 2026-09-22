import type { ITheme } from "@xterm/xterm";

export type StyleReader = (name: string) => string;

const FALLBACK_BACKGROUND = "#1f1f1f";
const FALLBACK_FOREGROUND = "#e6e6e6";
const FALLBACK_SELECTION = "#7f7f7f59";
const FALLBACK_DANGER = "#f14c4c";
const FALLBACK_OK = "#89d185";
const FALLBACK_FONT_SIZE = 13;

const ANSI = {
  black: "#1f1f1f",
  red: "#f14c4c",
  green: "#89d185",
  yellow: "#d7ba7d",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#e6e6e6",
  brightBlack: "#6b6b6b",
  brightRed: "#f97b7b",
  brightGreen: "#b5e8b0",
  brightYellow: "#e9d8a0",
  brightBlue: "#9cdcfe",
  brightMagenta: "#d7a9e3",
  brightCyan: "#9fe8dc",
  brightWhite: "#ffffff",
} as const;

export function terminalTheme(read: StyleReader): ITheme {
  const background = read("--editor") || FALLBACK_BACKGROUND;
  const foreground = read("--base") || FALLBACK_FOREGROUND;
  const danger = read("--danger") || FALLBACK_DANGER;
  const ok = read("--ok") || FALLBACK_OK;
  return {
    ...ANSI,
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: FALLBACK_SELECTION,
    red: danger,
    brightRed: danger,
    green: ok,
    brightGreen: ok,
  };
}

export function terminalFontSize(read: StyleReader): number {
  const size = Number.parseInt(read("--font-size"), 10);
  if (!Number.isFinite(size) || size < 8 || size > 32) return FALLBACK_FONT_SIZE;
  return size;
}
