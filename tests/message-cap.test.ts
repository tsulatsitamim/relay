import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_MESSAGE_CAP,
  capAgentMessage,
} from "../src/renderer/message-cap.ts";

describe("capAgentMessage", () => {
  it("returns short text untouched", () => {
    const result = capAgentMessage("hello");
    expect(result.text).toBe("hello");
    expect(result.capped).toBe(false);
  });

  it("caps text at the character limit", () => {
    const result = capAgentMessage("a".repeat(AGENT_MESSAGE_CAP + 100));
    expect(result.capped).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(AGENT_MESSAGE_CAP);
  });

  it("does not split a surrogate pair at the cutoff", () => {
    const text = "a".repeat(AGENT_MESSAGE_CAP - 1) + "😀" + "b".repeat(100);
    const result = capAgentMessage(text);
    expect(result.capped).toBe(true);
    expect(result.text).toBe("a".repeat(AGENT_MESSAGE_CAP - 1));
  });
});

describe("capAgentMessage fallback without Intl.Segmenter", () => {
  const original = Intl.Segmenter;
  afterEach(() => {
    Object.defineProperty(Intl, "Segmenter", {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it("falls back to a surrogate-safe slice", () => {
    Object.defineProperty(Intl, "Segmenter", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const text = "a".repeat(AGENT_MESSAGE_CAP - 1) + "😀" + "b".repeat(100);
    const result = capAgentMessage(text);
    expect(result.text).toBe("a".repeat(AGENT_MESSAGE_CAP - 1));
    expect(result.text.charCodeAt(result.text.length - 1)).toBe(0x61);
  });
});
