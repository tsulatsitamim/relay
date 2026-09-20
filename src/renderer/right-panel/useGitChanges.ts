import { useCallback, useEffect, useRef, useState } from "react";
import type { GitChangesResult } from "../../shared/git.ts";

export function useGitChanges(cwd: string | null) {
  const [changes, setChanges] = useState<GitChangesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const refresh = useCallback(() => {
    if (!cwd) {
      setChanges(null);
      setLoading(false);
      setError(null);
      return;
    }
    const run = runRef.current + 1;
    runRef.current = run;
    setLoading(true);
    void window.relay
      .gitChanges(cwd)
      .then((result) => {
        if (runRef.current !== run) return;
        setChanges(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (runRef.current !== run) return;
        setChanges(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (runRef.current !== run) return;
        setLoading(false);
      });
  }, [cwd]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { changes, loading, error, refresh };
}
