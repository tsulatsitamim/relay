import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Logger = {
  info(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
};

export function createLogger(file: string): Logger {
  mkdirSync(dirname(file), { recursive: true });
  const append = (entry: Record<string, unknown>): void => {
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
  };
  return {
    info(message, extra) {
      append({
        t: new Date().toISOString(),
        message,
        ...sanitize(extra),
      });
    },
    error(message, extra) {
      append({
        t: new Date().toISOString(),
        level: "error",
        message,
        ...sanitize(extra),
      });
    },
  };
}

function sanitize(extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) return {};
  const { prompt: _prompt, text: _text, ...rest } = extra;
  return rest;
}
