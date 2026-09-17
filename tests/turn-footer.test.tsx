// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TurnFooter } from "../src/renderer/TurnFooter.tsx";
import { formatTime } from "../src/renderer/time.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(cleanup);

const t0 = 1_700_000_000_000;
const completed: TranscriptEvent[] = [
  { id: "u1", kind: "user", payload: { text: "go" }, createdAt: t0 },
  {
    id: "a1",
    kind: "agent_message",
    payload: { text: "done" },
    createdAt: t0 + 42000,
  },
];

describe("TurnFooter", () => {
  it("renders the worked-for duration for a completed turn", () => {
    render(<TurnFooter events={completed} lastPromptAt={t0} working={false} />);
    expect(screen.getByText("Worked for 42s")).toBeTruthy();
  });

  it("keeps the absolute end time in the DOM for the hover swap", () => {
    const { container } = render(
      <TurnFooter events={completed} lastPromptAt={t0} working={false} />,
    );
    expect(container.querySelector(".turn-duration")).toBeTruthy();
    expect(container.querySelector(".turn-time")!.textContent).toBe(
      formatTime(t0 + 42000),
    );
  });

  it("offers a copy action for the turn text", () => {
    render(<TurnFooter events={completed} lastPromptAt={t0} working={false} />);
    expect(screen.getByRole("button", { name: "Copy turn" })).toBeTruthy();
  });

  it("hides the footer and shows the working row while working", () => {
    const { container } = render(
      <TurnFooter events={completed} lastPromptAt={t0} working />,
    );
    expect(container.querySelector(".turn-footer")).toBeNull();
    expect(container.querySelector(".working-row")).toBeTruthy();
  });

  it("renders nothing without a completed turn", () => {
    const { container } = render(
      <TurnFooter
        events={[{ id: "u1", kind: "user", payload: {}, createdAt: t0 }]}
        lastPromptAt={t0}
        working={false}
      />,
    );
    expect(container.querySelector(".turn-footer")).toBeNull();
  });
});
