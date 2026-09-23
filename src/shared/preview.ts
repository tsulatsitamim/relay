export const PREVIEW_PARTITION = "persist:relay-preview";
export const MAX_PREVIEWS_PER_SESSION = 8;
export const DEFAULT_PREVIEW_TITLE = "Preview";

const PREVIEW_ID = /^preview:[0-9a-fA-F-]{36}$/;

// Loopback, link-local and the RFC 1918 ranges. A dev server binds to one of
// these or to *.local; anything else is not a preview and goes to the browser.
const LOCAL_V4 =
  /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export type PreviewEvent =
  | {
      type: "previewState";
      previewId: string;
      state: "loading" | "loaded" | "failed";
      message?: string;
    }
  | { type: "previewNavigated"; previewId: string; url: string };

export type PreviewCreateResult = {
  previewId: `preview:${string}`;
  title: string;
  url: string;
};

export type PreviewNavigateResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

export function isPreviewId(value: unknown): value is `preview:${string}` {
  return typeof value === "string" && PREVIEW_ID.test(value);
}

export function isLocalHostname(host: string): boolean {
  const value = host.toLowerCase();
  if (value === "localhost" || value === "::1" || value === "[::1]") return true;
  if (value.endsWith(".local")) return true;
  return LOCAL_V4.test(value);
}

export function isLocalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return isLocalHostname(parsed.hostname);
}

export function normalizePreviewUrl(
  input: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "Enter a local address, for example localhost:5173" };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, reason: "That is not a valid address" };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That is not a valid address" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http and https local addresses can be previewed" };
  }
  if (!isLocalHostname(parsed.hostname)) {
    return {
      ok: false,
      reason: `${parsed.hostname} is not a local address — opening it in your browser`,
    };
  }
  return { ok: true, url: parsed.toString() };
}

export function previewTitleFromUrl(url: string): string {
  if (!url) return DEFAULT_PREVIEW_TITLE;
  try {
    return new URL(url).host || DEFAULT_PREVIEW_TITLE;
  } catch {
    return DEFAULT_PREVIEW_TITLE;
  }
}
