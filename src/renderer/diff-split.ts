import { unifiedDiff } from "../shared/diff.ts";

export type SplitCell = {
  text: string;
  type: "context" | "add" | "del";
  line: number;
};

export type SplitRow = {
  left: SplitCell | null;
  right: SplitCell | null;
};

export function splitDiff(oldText: string | null, newText: string): SplitRow[] {
  const text = unifiedDiff(oldText, newText, "file");
  const rows: SplitRow[] = [];
  let oldLine = 1;
  let newLine = 1;
  let dels: SplitCell[] = [];
  let adds: SplitCell[] = [];

  function flush() {
    const count = Math.max(dels.length, adds.length);
    for (let i = 0; i < count; i++) {
      rows.push({ left: dels[i] ?? null, right: adds[i] ?? null });
    }
    dels = [];
    adds = [];
  }

  for (const raw of text.split("\n")) {
    if (raw.startsWith("---") || raw.startsWith("+++")) continue;
    if (raw.startsWith("@@")) {
      flush();
      const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      oldLine = header ? Number(header[1]) : 1;
      newLine = header ? Number(header[2]) : 1;
      continue;
    }
    if (raw.startsWith("+")) {
      adds.push({ text: raw.slice(1), type: "add", line: newLine++ });
    } else if (raw.startsWith("-")) {
      dels.push({ text: raw.slice(1), type: "del", line: oldLine++ });
    } else {
      flush();
      const content = raw.startsWith(" ") ? raw.slice(1) : raw;
      rows.push({
        left: { text: content, type: "context", line: oldLine++ },
        right: { text: content, type: "context", line: newLine++ },
      });
    }
  }
  flush();
  return rows;
}

export function splitCommentLines(rows: SplitRow[]): (number | null)[] {
  const refs: (number | null)[] = rows.map((row) => row.right?.line ?? null);
  for (let i = 0; i < refs.length; i++) {
    if (refs[i] != null) continue;
    let next: number | null = null;
    for (let j = i + 1; j < refs.length; j++) {
      if (rows[j]!.right) {
        next = rows[j]!.right!.line;
        break;
      }
    }
    if (next != null) {
      refs[i] = next;
      continue;
    }
    for (let j = i - 1; j >= 0; j--) {
      if (rows[j]!.right) {
        refs[i] = rows[j]!.right!.line;
        break;
      }
    }
  }
  return refs;
}