import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/main/logger.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function logFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-log-"));
  dirs.push(dir);
  return join(dir, "relay.log");
}

describe("logger", () => {
  it("writes info lines without a level", () => {
    const file = logFile();
    createLogger(file).info("hello", { sessionId: "s1" });
    const entry = JSON.parse(readFileSync(file, "utf8").trim());
    expect(entry.message).toBe("hello");
    expect(entry.sessionId).toBe("s1");
    expect(entry.level).toBeUndefined();
  });

  it("writes error lines with the error level and sanitises prompts", () => {
    const file = logFile();
    createLogger(file).error("boom", {
      sessionId: "s1",
      prompt: "secret",
      text: "secret",
    });
    const entry = JSON.parse(readFileSync(file, "utf8").trim());
    expect(entry.level).toBe("error");
    expect(entry.message).toBe("boom");
    expect(entry.sessionId).toBe("s1");
    expect(entry.prompt).toBeUndefined();
    expect(entry.text).toBeUndefined();
  });
});