type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

function capableDocument(): ViewTransitionDocument | null {
  if (typeof document === "undefined") return null;
  return document as ViewTransitionDocument;
}

export function supportsViewTransition(): boolean {
  const doc = capableDocument();
  return doc !== null && typeof doc.startViewTransition === "function";
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function runTransition(update: () => void): void {
  const doc = capableDocument();
  if (
    doc !== null &&
    typeof doc.startViewTransition === "function" &&
    !prefersReducedMotion()
  ) {
    try {
      doc.startViewTransition(update);
      return;
    } catch {
      update();
      return;
    }
  }
  update();
}