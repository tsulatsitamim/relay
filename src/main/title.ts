export function titleFromPrompt(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  if (!line) return "Untitled";
  return line.length > 72 ? line.slice(0, 72) : line;
}
