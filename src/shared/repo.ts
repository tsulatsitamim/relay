import type { Repo } from "./types.ts";

export function normPath(path: string) {
  return path.replace(/\/+$/, "");
}

export function repoFor(cwd: string, repos: Repo[]) {
  const dir = normPath(cwd);
  return repos
    .map((repo) => ({ repo, path: normPath(repo.path) }))
    .filter(({ path }) => dir === path || dir.startsWith(`${path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.repo;
}
