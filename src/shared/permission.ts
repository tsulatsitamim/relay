import type { PermissionOptionLike } from "./types.ts";

export const PERSISTENT_GRANT_NOTE =
  "Grants access for the rest of this session without asking again.";

export function pickAutoAllowOption(
  options: PermissionOptionLike[],
): string | null {
  const always = options.find((o) => o.kind === "allow_always");
  if (always) return always.optionId;
  const once = options.find((o) => o.kind === "allow_once");
  if (once) return once.optionId;
  return options[0]?.optionId ?? null;
}

export function isPersistentAllow(option: PermissionOptionLike): boolean {
  return (
    option.kind === "allow_always" ||
    /always|don't ask|dont ask/i.test(option.name)
  );
}

export function permissionGrantNote(option: PermissionOptionLike): string | null {
  return isPersistentAllow(option) ? PERSISTENT_GRANT_NOTE : null;
}
