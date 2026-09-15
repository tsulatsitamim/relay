import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { MAX_ATTACHMENT_BYTES } from "../shared/attachments.ts";
import type { PromptAttachment } from "../shared/types.ts";

export { MAX_ATTACHMENT_BYTES } from "../shared/attachments.ts";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export function mimeForExt(ext: string): string | null {
  return MIME[ext.replace(/^\./, "").toLowerCase()] ?? null;
}

export function readAttachment(filePath: string): PromptAttachment | null {
  const mimeType = mimeForExt(extname(filePath));
  if (!mimeType) return null;
  try {
    if (statSync(filePath).size > MAX_ATTACHMENT_BYTES) return null;
    const data = readFileSync(filePath).toString("base64");
    return { name: basename(filePath), mimeType, data };
  } catch {
    return null;
  }
}
