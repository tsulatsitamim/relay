export type KeyScope = "global" | "notTyping";

export type KeyBinding = {
  id: string;
  keys: string;
  label: string;
  scope: KeyScope;
  run: () => void;
};

export type KeyEventLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

export type TypingTargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
};

export function eventKey(event: KeyEventLike): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  const key = event.key;
  parts.push(key.length === 1 ? key.toLowerCase() : key);
  return parts.join("+");
}

export function isTypingTarget(target: TypingTargetLike | null | undefined): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  return target.isContentEditable === true;
}

export function resolveBinding(
  bindings: KeyBinding[],
  key: string,
  typing: boolean,
): KeyBinding | null {
  for (const binding of bindings) {
    if (binding.keys !== key) continue;
    if (binding.scope === "notTyping" && typing) continue;
    return binding;
  }
  return null;
}

export function formatKeys(keys: string, mod: string): string {
  return keys
    .split("+")
    .map((part) => {
      if (part === "mod") return mod;
      if (part === "Escape") return "Esc";
      if (part === "ArrowUp") return "↑";
      if (part === "ArrowDown") return "↓";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("");
}
