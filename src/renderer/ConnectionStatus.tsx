import type { SessionStatus } from "../shared/types.ts";

export type ConnectionState = "connecting" | "connected" | "error";

export function connectionState(status: SessionStatus): {
  state: ConnectionState;
  label: string;
} {
  switch (status) {
    case "starting":
      return { state: "connecting", label: "Connecting" };
    case "working":
      return { state: "connected", label: "Working" };
    case "cancelling":
      return { state: "connected", label: "Cancelling" };
    case "error":
      return { state: "error", label: "Error" };
    case "exited":
      return { state: "error", label: "Exited" };
    default:
      return { state: "connected", label: "Connected" };
  }
}

export function ConnectionStatus({ status }: { status: SessionStatus }) {
  const { state, label } = connectionState(status);
  const title = `Connection: ${label}`;
  return (
    <span
      className={`conn-dot ${state}`}
      role="img"
      aria-label={title}
      title={title}
      data-status={status}
    />
  );
}
