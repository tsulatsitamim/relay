export function unifiedDiff(
  oldText: string | null | undefined,
  newText: string,
  path: string,
): string {
  const oldLines = oldText == null ? [] : splitLines(oldText);
  const newLines = splitLines(newText);
  const isNew = oldText == null;

  const header = [
    `--- ${isNew ? "/dev/null" : `a/${path}`}`,
    `+++ b/${path}`,
  ];

  if (oldLines.length === 0 && newLines.length === 0) {
    return header.join("\n");
  }

  const hunks: string[] = [];
  if (isNew) {
    hunks.push(`@@ -0,0 +1,${newLines.length} @@`);
    for (const line of newLines) hunks.push(`+${line}`);
  } else {
    hunks.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
    const max = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < max; i++) {
      const a = oldLines[i];
      const b = newLines[i];
      if (a === b) {
        hunks.push(` ${a ?? ""}`);
      } else {
        if (a !== undefined) hunks.push(`-${a}`);
        if (b !== undefined) hunks.push(`+${b}`);
      }
    }
  }

  return [...header, ...hunks].join("\n");
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
