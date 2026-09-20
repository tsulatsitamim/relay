import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { resolveWithinReal } from "./open-path.ts";
import type { ReadFileResult } from "../shared/ipc.ts";

export const MAX_PREVIEW_BYTES = 512 * 1024;

export function readFilePreview(cwd: string, path: string): ReadFileResult | null {
  const resolved = resolveWithinReal(cwd, path);
  if (!resolved) return null;
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    return null;
  }
  if (!stats.isFile()) return null;
  let buffer: Buffer;
  let truncated: boolean;
  try {
    if (stats.size <= MAX_PREVIEW_BYTES) {
      buffer = readFileSync(resolved);
      truncated = false;
    } else {
      const fd = openSync(resolved, "r");
      try {
        const chunk = Buffer.alloc(MAX_PREVIEW_BYTES + 1);
        const bytesRead = readSync(fd, chunk, 0, chunk.length, 0);
        truncated = bytesRead > MAX_PREVIEW_BYTES;
        buffer = chunk.subarray(0, MAX_PREVIEW_BYTES);
      } finally {
        closeSync(fd);
      }
    }
  } catch {
    return null;
  }
  const binary = buffer.includes(0);
  return {
    path,
    text: binary ? "" : buffer.toString("utf8"),
    truncated,
    binary,
  };
}
