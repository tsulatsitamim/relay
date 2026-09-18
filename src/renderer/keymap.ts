import { eventKey, type KeyBinding, type KeyEventLike } from "./keys.ts";

export type KeyOverrides = Record<string, string>;

const STORAGE_KEY = "relay.keybindings";
const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Dead",
  "AltGraph",
]);

export function loadOverrides(storage?: Pick<Storage, "getItem">): KeyOverrides {
  const store =
    storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!store) return {};
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const result: KeyOverrides = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value === "string") result[id] = value;
  }
  return result;
}

export function saveOverrides(
  overrides: KeyOverrides,
  storage?: Pick<Storage, "setItem">,
): void {
  const store =
    storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    return;
  }
}

export function applyOverrides(
  bindings: KeyBinding[],
  overrides: KeyOverrides,
): KeyBinding[] {
  let changed = false;
  const next = bindings.map((binding) => {
    const keys = overrides[binding.id];
    if (keys === undefined || keys === binding.keys) return binding;
    changed = true;
    return { ...binding, keys };
  });
  return changed ? next : bindings;
}

export function bindingConflicts(bindings: KeyBinding[]): Set<string> {
  const counts = new Map<string, number>();
  for (const binding of bindings) {
    counts.set(binding.keys, (counts.get(binding.keys) ?? 0) + 1);
  }
  const conflicts = new Set<string>();
  for (const binding of bindings) {
    if ((counts.get(binding.keys) ?? 0) > 1) conflicts.add(binding.id);
  }
  return conflicts;
}

export function captureKeys(event: KeyEventLike): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  return eventKey(event);
}