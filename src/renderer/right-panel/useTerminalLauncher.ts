import { useCallback, useState } from "react";
import type { PanelAction } from "../../shared/right-panel.ts";
import { DEFAULT_COLS, DEFAULT_ROWS } from "../../shared/terminal.ts";

export function useTerminalLauncher(
  sessionId: string,
  dispatch: (action: PanelAction) => void,
) {
  const [error, setError] = useState<string | null>(null);

  const launch = useCallback(async () => {
    try {
      const created = await window.relay.terminal.create(
        sessionId,
        DEFAULT_COLS,
        DEFAULT_ROWS,
      );
      setError(null);
      dispatch({
        type: "openTerminal",
        id: created.terminalId,
        title: created.title,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [sessionId, dispatch]);

  return { launch, error };
}
