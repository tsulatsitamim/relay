// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { TranscriptEvent } from "../src/shared/types.ts";

const toolCardRenders = vi.hoisted(() => ({ count: 0 }));
const diffBlockRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("../src/renderer/ToolCallCard", () => ({
  ToolCallCard: () => {
    toolCardRenders.count += 1;
    return null;
  },
  ToolKindIcon: () => null,
}));

vi.mock("../src/renderer/DiffBlock", () => ({
  DiffBlock: () => {
    diffBlockRenders.count += 1;
    return null;
  },
}));

import { DiffGroup } from "../src/renderer/DiffGroup.tsx";
import { ToolGroup } from "../src/renderer/ToolGroup.tsx";

afterEach(() => {
  cleanup();
  toolCardRenders.count = 0;
  diffBlockRenders.count = 0;
});

function call(id: string, kind: string, status = "completed"): TranscriptEvent {
  return {
    id,
    kind: "tool_call",
    payload: { title: `Run ${id}`, kind, status },
  };
}

function diff(id: string, path: string): TranscriptEvent {
  return { id, kind: "diff", payload: { path, oldText: null, newText: "x\n" } };
}

describe("ToolGroup memoization", () => {
  it("skips members when a new events array holds identical references", () => {
    const events = [call("1", "edit"), call("2", "edit")];
    const { rerender } = render(<ToolGroup events={events} />);
    const before = toolCardRenders.count;
    expect(before).toBe(2);

    rerender(<ToolGroup events={[...events]} />);

    expect(toolCardRenders.count).toBe(before);
  });

  it("renders members again when one reference changes", () => {
    const events = [call("1", "edit"), call("2", "edit")];
    const { rerender } = render(<ToolGroup events={events} />);
    const before = toolCardRenders.count;

    rerender(<ToolGroup events={[events[0]!, call("2", "execute")]} />);

    expect(toolCardRenders.count).toBeGreaterThan(before);
  });
});

describe("DiffGroup memoization", () => {
  it("skips expanded files when a new events array holds identical references", () => {
    const events = [diff("d1", "a.ts"), diff("d2", "b.ts")];
    const { rerender, getByRole } = render(<DiffGroup events={events} />);
    fireEvent.click(getByRole("button", { name: /changed files/i }));
    const before = diffBlockRenders.count;
    expect(before).toBe(2);

    rerender(<DiffGroup events={[...events]} />);

    expect(diffBlockRenders.count).toBe(before);
  });

  it("renders expanded files again when one reference changes", () => {
    const events = [diff("d1", "a.ts"), diff("d2", "b.ts")];
    const { rerender, getByRole } = render(<DiffGroup events={events} />);
    fireEvent.click(getByRole("button", { name: /changed files/i }));
    const before = diffBlockRenders.count;

    rerender(<DiffGroup events={[events[0]!, diff("d2", "b.ts")]} />);

    expect(diffBlockRenders.count).toBeGreaterThan(before);
  });
});
