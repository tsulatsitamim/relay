export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function isNearBottom(metrics: ScrollMetrics, threshold = 48): boolean {
  const distance = metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight);
  return distance <= threshold;
}

export type FollowMode = "following" | "free";

export type FollowIntent =
  | "scrolled-up"
  | "near-bottom"
  | "jump-to-latest"
  | "programmatic";

export function nextFollowMode(mode: FollowMode, intent: FollowIntent): FollowMode {
  switch (intent) {
    case "scrolled-up":
      return "free";
    case "near-bottom":
    case "jump-to-latest":
      return "following";
    case "programmatic":
      return mode;
  }
}
