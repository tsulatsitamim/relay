import type { TranscriptEvent } from "../shared/types.ts";

export type RecallState = { index: number; draft: string };

export const initialRecall: RecallState = { index: -1, draft: "" };

export function promptHistory(
  events: TranscriptEvent[],
  sent: string[] = [],
): string[] {
  const texts: string[] = [];
  for (let index = sent.length - 1; index >= 0; index -= 1) {
    const text = sent[index]?.trim();
    if (text) texts.push(text);
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.kind !== "user") continue;
    const text = event.payload.text;
    if (typeof text !== "string" || !text.trim()) continue;
    texts.push(text);
  }
  const out: string[] = [];
  for (const text of texts) {
    if (out[out.length - 1] !== text) out.push(text);
  }
  return out;
}

export function recallPrev(
  state: RecallState,
  history: string[],
  current: string,
): RecallState {
  if (history.length === 0) return state;
  const index = Math.min(state.index + 1, history.length - 1);
  if (state.index !== -1 && index === state.index) return state;
  const draft = state.index === -1 ? current : state.draft;
  return { index, draft };
}

export function recallNext(state: RecallState, history: string[]): RecallState {
  if (state.index === -1) return state;
  const index = state.index - 1;
  if (index < 0) return { index: -1, draft: state.draft };
  return { index, draft: state.draft };
}

export function recallText(state: RecallState, history: string[]): string {
  if (state.index === -1) return state.draft;
  return history[state.index] ?? state.draft;
}
