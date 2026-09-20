import { useCallback, useEffect, useRef, useState } from "react";
import type { GitChangesResult } from "../../shared/git.ts";

export function useGitChanges(cwd: string | null, refreshKey: number = 0) {
  const [changes, setChanges] = useState<GitChangesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);
  const lastKeyRef = useRef(refreshKey);

  const refresh = useCallback(() => {
    if (!cwd) {
      runRef.current += 1;
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

  useEffect(() => {
    if (lastKeyRef.current === refreshKey) return;
    lastKeyRef.current = refreshKey;
    refresh();
  }, [refreshKey, refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return { changes, loading, error, refresh };
}
