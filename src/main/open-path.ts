import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolveWithin(cwd: string, path: string): string | null {
  if (!cwd) return null;
  const base = resolve(cwd);
  const target = isAbsolute(path) ? resolve(path) : resolve(base, path);
  const rel = relative(base, target);
  if (rel === "") return target;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return target;
}
