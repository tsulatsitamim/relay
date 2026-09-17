import { describe, expect, it, vi } from "vitest";
import {
  eventKey,
  formatKeys,
  isTypingTarget,
  resolveBinding,
  type KeyBinding,
} from "../src/renderer/keys.ts";

function binding(overrides: Partial<KeyBinding> = {}): KeyBinding {
  return {
    id: "x",
    keys: "mod+n",
    label: "New chat",
    scope: "global",
    run: vi.fn(),
    ...overrides,
  };
}

describe("eventKey", () => {
  it("treats meta and ctrl as the same mod prefix", () => {
    expect(eventKey({ key: "n", metaKey: true })).toBe("mod+n");
    expect(eventKey({ key: "n", ctrlKey: true })).toBe("mod+n");
  });

  it("lower-cases single printable characters", () => {
    expect(eventKey({ key: "N", metaKey: true })).toBe("mod+n");
    expect(eventKey({ key: "?" })).toBe("?");
  });

  it("keeps multi-character key names", () => {
    expect(eventKey({ key: "Escape" })).toBe("Escape");
    expect(eventKey({ key: "ArrowDown" })).toBe("ArrowDown");
  });

  it("ignores shift for letter shortcuts", () => {
    expect(eventKey({ key: "N", metaKey: true, shiftKey: true })).toBe("mod+n");
  });

  it("includes alt and mod together", () => {
    expect(eventKey({ key: "k", metaKey: true, altKey: true })).toBe("mod+alt+k");
  });
});

describe("isTypingTarget", () => {
  it("detects inputs, textareas and contenteditable nodes", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("rejects buttons, divs and missing targets", () => {
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("resolveBinding", () => {
  it("matches by key and returns the first binding in order", () => {
    const first = binding({ id: "a", run: vi.fn() });
    const second = binding({ id: "b", run: vi.fn() });
    expect(resolveBinding([first, second], "mod+n", false)).toBe(first);
  });

  it("skips notTyping bindings while typing", () => {
    const help = binding({ id: "help", keys: "?", scope: "notTyping" });
    expect(resolveBinding([help], "?", true)).toBeNull();
    expect(resolveBinding([help], "?", false)).toBe(help);
  });

  it("keeps global bindings active while typing", () => {
    const global = binding();
    expect(resolveBinding([global], "mod+n", true)).toBe(global);
  });

  it("returns null when nothing matches", () => {
    expect(resolveBinding([binding()], "mod+z", false)).toBeNull();
  });
});

describe("formatKeys", () => {
  it("renders the mod prefix and upper-cases letters", () => {
    expect(formatKeys("mod+n", "⌘")).toBe("⌘N");
    expect(formatKeys("mod+n", "Ctrl+")).toBe("Ctrl+N");
  });

  it("shortens named keys", () => {
    expect(formatKeys("Escape", "⌘")).toBe("Esc");
    expect(formatKeys("ArrowUp", "⌘")).toBe("↑");
    expect(formatKeys("?", "⌘")).toBe("?");
  });
});
