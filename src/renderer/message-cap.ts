export const AGENT_MESSAGE_CAP = 32000;

export function capAgentMessage(text: string): {
  text: string;
  capped: boolean;
} {
  if (text.length <= AGENT_MESSAGE_CAP) return { text, capped: false };
  return { text: truncateGraphemes(text, AGENT_MESSAGE_CAP), capped: true };
}

function truncateGraphemes(text: string, limit: number): string {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let out = "";
    for (const { segment } of segmenter.segment(text)) {
      if (out.length + segment.length > limit) break;
      out += segment;
    }
    return out;
  }
  // Fallback when Intl.Segmenter is unavailable: drop a trailing surrogate
  // half so the slice never ends in the middle of a code point.
  let end = limit;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end);
}
