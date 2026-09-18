import { useEffect, useRef, useState } from "react";
import {
  scrollTopFromThumb,
  thumbGeometry,
  type ThumbGeometry,
} from "./overlay-scrollbar.ts";

const HIDE_DELAY = 800;
const PAGE_RATIO = 0.9;

export function OverlayScrollbar({
  scroller,
}: {
  scroller: () => HTMLElement | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef(scroller);
  scrollerRef.current = scroller;
  const [geo, setGeo] = useState<ThumbGeometry>({
    top: 0,
    height: 0,
    visible: false,
  });
  const [active, setActive] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  useEffect(() => {
    const el = scrollerRef.current();
    const track = trackRef.current;
    if (!el || !track) return;
    const measure = () => {
      const next = thumbGeometry({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        trackHeight: track.clientHeight,
      });
      setGeo((prev) =>
        prev.top === next.top &&
        prev.height === next.height &&
        prev.visible === next.visible
          ? prev
          : next,
      );
    };
    const show = () => {
      setActive(true);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setActive(false), HIDE_DELAY);
    };
    const onScroll = () => {
      measure();
      show();
    };
    const onEnter = () => setActive(true);
    const onLeave = () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      setActive(false);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(el);
      observer.observe(track);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      observer?.disconnect();
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const visible = geo.visible && active;

  function onTrackPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const el = scrollerRef.current();
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const below = event.clientY - rect.top > geo.top + geo.height;
    const page = el.clientHeight * PAGE_RATIO;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.max(0, Math.min(el.scrollTop + (below ? page : -page), max));
    setActive(true);
  }

  function onThumbPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const el = scrollerRef.current();
    if (!el) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startTop: geo.top };
    setActive(true);
  }

  function onThumbPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const el = scrollerRef.current();
    const track = trackRef.current;
    if (!state || !el || !track) return;
    el.scrollTop = scrollTopFromThumb({
      thumbTop: state.startTop + (event.clientY - state.startY),
      trackHeight: track.clientHeight,
      thumbHeight: geo.height,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  }

  function onThumbPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={trackRef}
      className="overlay-scroll-track"
      aria-hidden="true"
      data-visible={visible ? "true" : "false"}
      onPointerDown={onTrackPointerDown}
    >
      <div
        className="overlay-thumb"
        data-visible={visible ? "true" : "false"}
        style={{ top: geo.top, height: geo.height }}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={onThumbPointerUp}
        onPointerCancel={onThumbPointerUp}
      />
    </div>
  );
}