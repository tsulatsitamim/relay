import { readFileSync, statSync } from "node:fs";
import { resolveWithinReal } from "./open-path.ts";
import type { ReadFileResult } from "../shared/ipc.ts";

export const MAX_PREVIEW_BYTES = 512 * 1024;

export function readFilePreview(cwd: string, path: string): ReadFileResult | null {
  const resolved = resolveWithinReal(cwd, path);
  if (!resolved) return null;
  try {
    if (!statSync(resolved).isFile()) return null;
  } catch {
    return null;
  }
  let buffer: Buffer;
  try {
    buffer = readFileSync(resolved);
  } catch {
    return null;
  }
  const truncated = buffer.length > MAX_PREVIEW_BYTES;
  const slice = truncated ? buffer.subarray(0, MAX_PREVIEW_BYTES) : buffer;
  const binary = slice.includes(0);
  return {
    path,
    text: binary ? "" : slice.toString("utf8"),
    truncated,
    binary,
  };
}
