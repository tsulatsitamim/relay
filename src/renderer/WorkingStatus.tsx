import { useEffect, useState } from "react";

type Props = {
  active: boolean;
  since?: number;
  variant?: "head" | "row";
};

export function WorkingStatus({ active, since, variant = "head" }: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const secs = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
  const label = `Working · ${secs}s`;
  const dots = (
    <span className="dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );

  if (variant === "row") {
    return (
      <div className="working-row">
        {dots}
        <span>{label}</span>
      </div>
    );
  }

  return (
    <span className="thread-status">
      {dots}
      {label}
    </span>
  );
}
