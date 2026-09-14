import type { PermissionOptionLike } from "../shared/types.ts";

export function pickAutoAllowOption(
  options: PermissionOptionLike[],
): string | null {
  const always = options.find((o) => o.kind === "allow_always");
  if (always) return always.optionId;
  const once = options.find((o) => o.kind === "allow_once");
  if (once) return once.optionId;
  return options[0]?.optionId ?? null;
}
