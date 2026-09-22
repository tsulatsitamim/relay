import { describe, expect, it } from "vitest";
import { panelReducer, EMPTY_PANEL_STATE } from "../src/shared/right-panel.ts";
import { closedTerminalIds } from "../src/renderer/right-panel/terminal-lifecycle.ts";

const A = "terminal:11111111-1111-4111-8111-111111111111";
const B = "terminal:22222222-2222-4222-8222-222222222222";

function stateWithTerminals() {
  let state = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "changes" });
  state = panelReducer(state, { type: "openTerminal", id: A, title: "Terminal 1" });
  state = panelReducer(state, { type: "openTerminal", id: B, title: "Terminal 2" });
  return state;
}

describe("closedTerminalIds", () => {
  it("reports nothing when a terminal survives", () => {
    const state = stateWithTerminals();
    const after = panelReducer(state, { type: "close", id: "changes" });
    expect(closedTerminalIds(state.surfaces, after.surfaces)).toEqual([]);
  });

  it("reports a closed terminal, closeOthers and closeAll", () => {
    const state = stateWithTerminals();
    const one = panelReducer(state, { type: "close", id: A });
    expect(closedTerminalIds(state.surfaces, one.surfaces)).toEqual([A]);

    const others = panelReducer(state, { type: "closeOthers", id: A });
    expect(closedTerminalIds(state.surfaces, others.surfaces)).toEqual([B]);

    const all = panelReducer(state, { type: "closeAll" });
    expect(closedTerminalIds(state.surfaces, all.surfaces)).toEqual([A, B]);
  });

  it("reports every terminal when the session is removed", () => {
    const state = stateWithTerminals();
    const gone = panelReducer(state, { type: "removeSession" });
    expect(closedTerminalIds(state.surfaces, gone.surfaces)).toEqual([A, B]);
  });

  it("ignores non-terminal surfaces", () => {
    const state = stateWithTerminals();
    expect(closedTerminalIds(state.surfaces, [])).toEqual([A, B]);
    const files = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "files" });
    expect(closedTerminalIds(files.surfaces, [])).toEqual([]);
  });
});
