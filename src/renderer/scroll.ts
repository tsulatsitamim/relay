export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function isNearBottom(metrics: ScrollMetrics, threshold = 48): boolean {
  const distance = metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight);
  return distance <= threshold;
}
