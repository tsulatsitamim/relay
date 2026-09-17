export type ToolTone = "pending" | "running" | "done" | "error";

export function toolStatusMeta(status: unknown): { tone: ToolTone; label: string } {
  switch (status) {
    case "in_progress":
      return { tone: "running", label: "Running" };
    case "completed":
      return { tone: "done", label: "Completed" };
    case "failed":
      return { tone: "error", label: "Failed" };
    default:
      return { tone: "pending", label: "Pending" };
  }
}

export type ToolIconKind = "read" | "edit" | "execute" | "search" | "web" | "generic";

export function toolIcon(kind: unknown, title?: string): ToolIconKind {
  switch (typeof kind === "string" ? kind.toLowerCase() : "") {
    case "read":
      return "read";
    case "edit":
    case "write":
      return "edit";
    case "execute":
    case "bash":
    case "shell":
      return "execute";
    case "search":
      return "search";
    case "fetch":
    case "web":
    case "browser":
      return "web";
    case "think":
    case "reason":
      return "generic";
  }
  const hint = (title ?? "").toLowerCase();
  if (/\b(?:read|open|cat)\b/.test(hint)) return "read";
  if (/\b(?:edit|write|patch)\b/.test(hint)) return "edit";
  if (/\b(?:run|exec|test|build)\b/.test(hint)) return "execute";
  if (/\b(?:search|grep|find)\b/.test(hint)) return "search";
  if (/\b(?:fetch|http|web|url)\b/.test(hint)) return "web";
  return "generic";
}

export function prettyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
