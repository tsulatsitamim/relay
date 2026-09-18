export type ThumbGeometry = {
  top: number;
  height: number;
  visible: boolean;
};

export function thumbGeometry(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
  minThumb?: number;
}): ThumbGeometry {
  const { scrollTop, scrollHeight, clientHeight, trackHeight } = input;
  if (scrollHeight <= clientHeight || trackHeight <= 0) {
    return { top: 0, height: trackHeight, visible: false };
  }
  const height = Math.max(
    input.minThumb ?? 24,
    (clientHeight / scrollHeight) * trackHeight,
  );
  const maxTop = trackHeight - height;
  const rawTop = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
  const top = Math.max(0, Math.min(rawTop, maxTop));
  return { top, height, visible: true };
}

export function scrollTopFromThumb(input: {
  thumbTop: number;
  trackHeight: number;
  thumbHeight: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  const { thumbTop, trackHeight, thumbHeight, scrollHeight, clientHeight } = input;
  if (scrollHeight <= clientHeight) return 0;
  const maxTop = trackHeight - thumbHeight;
  if (maxTop <= 0) return 0;
  const maxScroll = scrollHeight - clientHeight;
  const ratio = thumbTop / maxTop;
  return Math.max(0, Math.min(ratio * maxScroll, maxScroll));
}