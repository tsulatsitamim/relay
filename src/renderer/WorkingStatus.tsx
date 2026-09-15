import { useEffect, useState } from "react";

export function WorkingStatus({ status, since }: { status: string; since?: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (status !== "working" || !since) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [status, since]);
  if (status !== "working") return null;
  const secs = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
  return <span className="thread-status">Working · {secs}s</span>;
}
