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
