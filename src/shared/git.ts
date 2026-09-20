export type GitChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export type GitChange = {
  path: string;
  status: GitChangeStatus;
  oldPath?: string;
  insertions?: number;
  deletions?: number;
};

export type GitChangesResult = {
  branch: string;
  files: GitChange[];
};

export type GitFileDiff = {
  path: string;
  oldText: string | null;
  newText: string;
  truncated: boolean;
  binary: boolean;
};

export const MAX_DIFF_LINES = 4000;

const LABELS: Record<GitChangeStatus, string> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
  untracked: "Untracked",
  conflicted: "Conflicted",
};

const LETTERS: Record<string, GitChangeStatus> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "added",
  T: "modified",
  U: "conflicted",
};

export function changeLabel(status: GitChangeStatus): string {
  return LABELS[status];
}

function statusFor(x: string, y: string): GitChangeStatus {
  if (x === "?" && y === "?") return "untracked";
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
    return "conflicted";
  }
  if (x === "R" || y === "R") return "renamed";
  const code = y !== "." ? y : x;
  return LETTERS[code] ?? "modified";
}

export function branchFromPorcelain(output: string): string {
  const match = /# branch\.head ([^\0\n]*)/.exec(output);
  return match ? match[1]!.trim() : "";
}

export function parsePorcelainV2(output: string): GitChange[] {
  const tokens = output.split("\0");
  const files: GitChange[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token) continue;
    const type = token[0];
    if (type === "1" || type === "2") {
      const parts = token.split(" ");
      const xy = parts[1] ?? "..";
      const status = statusFor(xy[0] ?? ".", xy[1] ?? ".");
      if (type === "2") {
        const path = parts.slice(9).join(" ");
        const oldPath = tokens[index + 1] ?? "";
        index += 1;
        files.push(oldPath ? { path, status, oldPath } : { path, status });
      } else {
        files.push({ path: parts.slice(8).join(" "), status });
      }
      continue;
    }
    if (type === "?") {
      files.push({ path: token.slice(2), status: "untracked" });
      continue;
    }
    if (type === "u") {
      const parts = token.split(" ");
      files.push({ path: parts.slice(10).join(" "), status: "conflicted" });
    }
  }
  return files;
}

export function parseNumstat(
  output: string,
): Map<string, { insertions: number; deletions: number }> {
  const stats = new Map<string, { insertions: number; deletions: number }>();
  const tokens = output.split("\0");
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token) continue;
    const parts = token.split("\t");
    if (parts.length < 3) continue;
    const insertions = parts[0] === "-" ? 0 : Number(parts[0]);
    const deletions = parts[1] === "-" ? 0 : Number(parts[1]);
    let path = parts[2] ?? "";
    if (!path) {
      const next = tokens[index + 2] ?? "";
      index += 2;
      path = next;
    }
    if (!path) continue;
    stats.set(path, {
      insertions: Number.isFinite(insertions) ? insertions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
    });
  }
  return stats;
}

export function mergeStats(
  files: GitChange[],
  stats: Map<string, { insertions: number; deletions: number }>,
): GitChange[] {
  return files.map((file) => {
    const stat = stats.get(file.path);
    return stat ? { ...file, ...stat } : file;
  });
}

export function truncateDiffText(
  text: string,
  maxLines: number = MAX_DIFF_LINES,
): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}
