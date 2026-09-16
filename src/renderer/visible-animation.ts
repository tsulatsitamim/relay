import { useEffect } from "react";
import type { RefObject } from "react";

export const VISIBLE_ANIMATION_PROPERTY = "--visible-animation-state";

export function applyAnimationVisibility(el: HTMLElement, visible: boolean): void {
  if (visible) {
    el.style.removeProperty(VISIBLE_ANIMATION_PROPERTY);
  } else {
    el.style.setProperty(VISIBLE_ANIMATION_PROPERTY, "paused");
  }
}

export function useVisibleAnimation(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        applyAnimationVisibility(entry.target as HTMLElement, entry.isIntersecting);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
