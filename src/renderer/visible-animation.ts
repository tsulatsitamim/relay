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

type VisibilitySubscriber = (visible: boolean) => void;

const subscribers = new Map<Element, VisibilitySubscriber>();
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        subscribers.get(entry.target)?.(entry.isIntersecting);
      }
    });
  }
  return observer;
}

export function subscribeVisibleAnimation(
  el: Element,
  callback: VisibilitySubscriber,
): () => void {
  const shared = getObserver();
  if (!shared) return () => {};
  subscribers.set(el, callback);
  shared.observe(el);
  return () => {
    subscribers.delete(el);
    shared.unobserve(el);
    if (subscribers.size === 0) {
      shared.disconnect();
      observer = null;
    }
  };
}

export function useVisibleAnimation(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return subscribeVisibleAnimation(el, (visible) => {
      applyAnimationVisibility(el, visible);
    });
  }, [ref]);
}
