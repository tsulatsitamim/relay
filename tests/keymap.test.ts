import { describe, expect, it } from "vitest";
import {
  applyOverrides,
  bindingConflicts,
  captureKeys,
  loadOverrides,
  saveOverrides,
} from "../src/renderer/keymap.ts";
import type { KeyBinding } from "../src/renderer/keys.ts";

function binding(overrides: Partial<KeyBinding> = {}): KeyBinding {
  return {
    id: "x",
    keys: "mod+n",
    label: "New chat",
    scope: "global",
    run: () => {},
    ...overrides,
  };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("loadOverrides", () => {
  it("reads a JSON object from the keybindings key", () => {
    const storage = fakeStorage({
      "relay.keybindings": JSON.stringify({ "new-chat": "mod+j" }),
    });
    expect(loadOverrides(storage)).toEqual({ "new-chat": "mod+j" });
  });

  it("returns an empty object when the key is absent", () => {
    expect(loadOverrides(fakeStorage())).toEqual({});
  });

  it("returns an empty object for garbage JSON", () => {
    expect(loadOverrides(fakeStorage({ "relay.keybindings": "not json" }))).toEqual({});
  });

  it("returns an empty object for non-object JSON", () => {
    expect(loadOverrides(fakeStorage({ "relay.keybindings": "[1,2,3]" }))).toEqual({});
    expect(loadOverrides(fakeStorage({ "relay.keybindings": "42" }))).toEqual({});
    expect(loadOverrides(fakeStorage({ "relay.keybindings": "null" }))).toEqual({});
  });

  it("drops non-string entries", () => {
    expect(
      loadOverrides(fakeStorage({ "relay.keybindings": '{"a":"mod+j","b":5}' })),
    ).toEqual({ a: "mod+j" });
  });
});

describe("saveOverrides", () => {
  it("round-trips through loadOverrides", () => {
    const storage = fakeStorage();
    saveOverrides({ palette: "mod+p" }, storage);
    expect(storage.getItem("relay.keybindings")).toBe('{"palette":"mod+p"}');
    expect(loadOverrides(storage)).toEqual({ palette: "mod+p" });
  });
});

describe("applyOverrides", () => {
  it("replaces keys for overridden ids and keeps other bindings intact", () => {
    const list = [
      binding({ id: "new-chat", keys: "mod+n", label: "New chat" }),
      binding({ id: "palette", keys: "mod+k", label: "Command palette" }),
    ];
    const next = applyOverrides(list, { palette: "mod+p" });
    expect(next[0]).toBe(list[0]);
    expect(next[1]).not.toBe(list[1]);
    expect(next[1]!.keys).toBe("mod+p");
    expect(next[1]!.label).toBe("Command palette");
  });

  it("ignores override ids that are not in the binding list", () => {
    const list = [binding({ id: "new-chat" })];
    expect(applyOverrides(list, { ghost: "mod+g" })).toBe(list);
  });

  it("returns the same array reference when nothing changes", () => {
    const list = [binding({ id: "new-chat", keys: "mod+n" })];
    expect(applyOverrides(list, {})).toBe(list);
    expect(applyOverrides(list, { "new-chat": "mod+n" })).toBe(list);
  });
});

describe("bindingConflicts", () => {
  it("collects ids that share a keys string", () => {
    const list = [
      binding({ id: "a", keys: "mod+k" }),
      binding({ id: "b", keys: "mod+k" }),
      binding({ id: "c", keys: "mod+j" }),
    ];
    expect(bindingConflicts(list)).toEqual(new Set(["a", "b"]));
  });

  it("compares case-sensitively", () => {
    const list = [
      binding({ id: "a", keys: "mod+k" }),
      binding({ id: "b", keys: "MOD+K" }),
    ];
    expect(bindingConflicts(list).size).toBe(0);
  });

  it("returns an empty set when all keys are unique", () => {
    expect(
      bindingConflicts([binding({ id: "a", keys: "x" }), binding({ id: "b", keys: "y" })]),
    ).toEqual(new Set());
  });
});

describe("captureKeys", () => {
  it("returns null for modifier-only presses", () => {
    for (const key of ["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "AltGraph"]) {
      expect(captureKeys({ key })).toBeNull();
    }
  });

  it("normalizes a chord like eventKey", () => {
    expect(captureKeys({ key: "J", metaKey: true })).toBe("mod+j");
    expect(captureKeys({ key: "?" })).toBe("?");
    expect(captureKeys({ key: "ArrowUp" })).toBe("ArrowUp");
  });
});