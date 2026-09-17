import { useEffect, useState } from "react";

type Info = { branch: string; worktree: boolean };

export function BranchPill({ cwd }: { cwd: string }) {
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    if (!cwd) return;
    void window.relay
      .branchInfo(cwd)
      .then((next) => {
        if (!cancelled) setInfo(next);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  if (!info) return null;

  return (
    <span
      className="branch-pill"
      title={info.worktree ? `Worktree · ${info.branch}` : info.branch}
    >
      <span className="branch-name">{info.branch}</span>
      {info.worktree ? <span className="branch-worktree">worktree</span> : null}
    </span>
  );
}
