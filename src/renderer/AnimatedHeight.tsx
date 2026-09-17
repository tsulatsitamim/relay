import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type Height = number | "auto";

export function AnimatedHeight({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<Height>(open ? "auto" : 0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!open) {
      const measured = node.scrollHeight;
      if (node.style.height === "auto" && measured > 0) {
        setHeight(measured);
        const collapse = () => setHeight(0);
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(collapse);
        } else {
          setTimeout(collapse, 0);
        }
      } else {
        setHeight(0);
      }
      return;
    }
    const measure = () => node.scrollHeight;
    setHeight(measure());
    const settle = () => setHeight("auto");
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName === "height") settle();
    };
    node.addEventListener("transitionend", onEnd);
    const fallback = setTimeout(settle, 240);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        setHeight((current) => (current === "auto" ? current : measure()));
      });
      observer.observe(node);
    }
    return () => {
      node.removeEventListener("transitionend", onEnd);
      clearTimeout(fallback);
      observer?.disconnect();
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className={`collapse${className ? ` ${className}` : ""}`}
      style={{ height: height === "auto" ? "auto" : `${height}px` }}
    >
      {children}
    </div>
  );
}