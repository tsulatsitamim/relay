import { useEffect, useRef } from "react";

type Props = {
  active: boolean;
  since?: number;
  variant?: "head" | "row";
};

function formatLabel(since?: number): string {
  const secs = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
  return `Working · ${secs}s`;
}

export function WorkingStatus({ active, since, variant = "head" }: Props) {
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const node = labelRef.current;
      if (node) node.textContent = formatLabel(since);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [active, since]);

  if (!active) return null;

  const label = formatLabel(since);
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
        <span ref={labelRef}>{label}</span>
      </div>
    );
  }

  return (
    <span className="thread-status">
      {dots}
      <span ref={labelRef}>{label}</span>
    </span>
  );
}
