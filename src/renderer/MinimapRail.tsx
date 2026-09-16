import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { IconChevron } from "./icons";
import {
  LINE_X,
  currentIndex,
  sideGutter,
  stripHeight,
  stripWidth,
  tickOffset,
  tickWidth,
  visibleIndices,
  type MinimapTurn,
  type RowBand,
} from "./minimap";

type Props = {
  turns: MinimapTurn[];
  scrollRef: RefObject<HTMLElement | null>;
  onJump: (index: number) => void;
};

export function MinimapRail({ turns, scrollRef, onJump }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [visible, setVisible] = useState<Set<number>>(() => new Set());

  const count = turns.length;

  const sync = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const container = rootRef.current?.parentElement ?? scroller.parentElement;
    const width = container?.clientWidth ?? scroller.clientWidth;
    const height = scroller.clientHeight;
    setViewport((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
    const rows = scroller.querySelectorAll<HTMLElement>("[data-user-turn]");
    if (rows.length === 0) return;
    const base = scroller.getBoundingClientRect().top;
    const scrollTop = scroller.scrollTop;
    const bands: RowBand[] = [];
    rows.forEach((row) => {
      const index = Number(row.dataset.userTurn);
      if (Number.isNaN(index)) return;
      const box = row.getBoundingClientRect();
      const top = box.top - base + scrollTop;
      bands.push({ index, top, bottom: top + box.height });
    });
    bands.sort((a, b) => a.top - b.top);
    const nextVisible = visibleIndices(bands, scrollTop, height);
    setVisible((prev) =>
      prev.size === nextVisible.length && nextVisible.every((index) => prev.has(index))
        ? prev
        : new Set(nextVisible),
    );
    setActive(currentIndex(bands, scrollTop, height));
  }, [scrollRef]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    sync();
    scroller.addEventListener("scroll", sync, { passive: true });
    const container = scroller.parentElement;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => sync());
      observer.observe(container);
    }
    return () => {
      scroller.removeEventListener("scroll", sync);
      observer?.disconnect();
    };
  }, [scrollRef, sync, count]);

  if (count < 2) return null;

  const activeIndex = Math.min(active, count - 1);
  const previewIndex = hovered ?? activeIndex;
  const previewTurn = turns[previewIndex];
  const height = stripHeight(count, viewport.height);
  const stripTop = Math.max(0, (viewport.height - height) / 2);
  const width = stripWidth(viewport.width);

  function jumpTo(index: number) {
    const clamped = Math.max(0, Math.min(count - 1, index));
    setActive(clamped);
    onJump(clamped);
  }

  function step(delta: number) {
    jumpTo(activeIndex + delta);
  }

  return (
    <div
      ref={rootRef}
      className="minimap"
      role="group"
      tabIndex={0}
      aria-label={`Jump to message: ${previewTurn?.prompt ?? "timeline"}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          step(event.key === "ArrowUp" ? -1 : 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          jumpTo(0);
        } else if (event.key === "End") {
          event.preventDefault();
          jumpTo(count - 1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          jumpTo(activeIndex);
        }
      }}
    >
      <div className="minimap-strip" style={{ top: stripTop, height, width }}>
        <div className="minimap-line" style={{ left: LINE_X }} />
        <button
          type="button"
          tabIndex={-1}
          className="minimap-step up"
          style={{ top: -24 }}
          aria-label="Previous message"
          disabled={activeIndex === 0}
          onClick={() => step(-1)}
        >
          <IconChevron />
        </button>
        {turns.map((turn, index) => {
          const distance = Math.abs(index - (hovered ?? activeIndex));
          const className = [
            "minimap-tick",
            visible.has(index) ? "crossing" : "",
            index === activeIndex ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={turn.id}
              type="button"
              tabIndex={-1}
              className={className}
              style={{ top: `${tickOffset(index, count) * 100}%`, width: tickWidth(distance) }}
              aria-label={`Jump to message ${index + 1}: ${turn.prompt}`}
              onClick={() => jumpTo(index)}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() =>
                setHovered((current) => (current === index ? null : current))
              }
            />
          );
        })}
        <button
          type="button"
          tabIndex={-1}
          className="minimap-step down"
          style={{ top: height + 8 }}
          aria-label="Next message"
          disabled={activeIndex === count - 1}
          onClick={() => step(1)}
        >
          <IconChevron />
        </button>
        {hovered != null && previewTurn ? (
          <div
            className="minimap-preview"
            style={{ top: `${tickOffset(hovered, count) * 100}%` }}
          >
            <div className="minimap-preview-prompt">{previewTurn.prompt}</div>
            {previewTurn.reply ? (
              <div className="minimap-preview-reply">{previewTurn.reply}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
