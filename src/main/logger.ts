import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Logger = {
  info(message: string, extra?: Record<string, unknown>): void;
};

export function createLogger(file: string): Logger {
  mkdirSync(dirname(file), { recursive: true });
  return {
    info(message, extra) {
      const line = JSON.stringify({
        t: new Date().toISOString(),
        message,
        ...sanitize(extra),
      });
      appendFileSync(file, `${line}\n`);
    },
  };
}

function sanitize(extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) return {};
  const { prompt: _prompt, text: _text, ...rest } = extra;
  return rest;
}
