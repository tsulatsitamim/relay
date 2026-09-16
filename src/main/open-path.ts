import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

function within(base: string, target: string): string | null {
  const rel = relative(base, target);
  if (rel === "") return target;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return target;
}

export function resolveWithin(cwd: string, path: string): string | null {
  if (!cwd) return null;
  const base = resolve(cwd);
  const target = isAbsolute(path) ? resolve(path) : resolve(base, path);
  return within(base, target);
}

export function resolveWithinReal(cwd: string, path: string): string | null {
  const resolved = resolveWithin(cwd, path);
  if (!resolved) return null;
  let realCwd: string;
  try {
    realCwd = realpathSync(resolve(cwd));
  } catch {
    return resolved;
  }
  try {
    return within(realCwd, realpathSync(resolved));
  } catch {
    return resolved;
  }
}
