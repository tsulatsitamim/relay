// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextMeter } from "../src/renderer/ContextMeter.tsx";

afterEach(cleanup);

describe("ContextMeter", () => {
  it("renders the used percentage of the window", () => {
    render(<ContextMeter usage={{ used: 25000, size: 100000 }} />);
    expect(screen.getByText("25%")).toBeTruthy();
  });

  it("turns danger past ninety percent", () => {
    const safe = render(<ContextMeter usage={{ used: 90000, size: 100000 }} />);
    expect(safe.container.querySelector(".context-meter.danger")).toBeNull();
    cleanup();

    const { container } = render(<ContextMeter usage={{ used: 91000, size: 100000 }} />);
    expect(container.querySelector(".context-meter.danger")).toBeTruthy();
    expect(screen.getByText("91%")).toBeTruthy();
  });

  it("hides without a usage event", () => {
    const { container } = render(<ContextMeter />);
    expect(container.querySelector(".context-meter")).toBeNull();
  });

  it("reveals tokens and cost formatted through the shared helpers", async () => {
    render(
      <ContextMeter
        usage={{ used: 1500, size: 8000, costAmount: 0.0123, costCurrency: "USD" }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Context 19% used/i }));
    expect(screen.getByText("1.5k / 8.0k tokens · USD0.0123")).toBeTruthy();
    expect(screen.getByText("19% of context window used")).toBeTruthy();
  });

  it("shows the turn tokens when the usage event carries them", async () => {
    render(
      <ContextMeter
        usage={{
          used: 1500,
          size: 8000,
          inputTokens: 1200,
          outputTokens: 340,
          cachedReadTokens: 512,
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Context 19% used/i }));
    expect(screen.getByText("This turn: 1.2k in / 340 out · 512 cached")).toBeTruthy();
  });

  it("omits the cached suffix", async () => {
    render(
      <ContextMeter
        usage={{ used: 1500, size: 8000, inputTokens: 1200, outputTokens: 340 }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Context 19% used/i }));
    expect(screen.getByText("This turn: 1.2k in / 340 out")).toBeTruthy();
  });

  it("hides the turn line without turn tokens", async () => {
    render(<ContextMeter usage={{ used: 1500, size: 8000 }} />);
    await userEvent.click(screen.getByRole("button", { name: /Context 19% used/i }));
    expect(screen.queryByText(/This turn:/)).toBeNull();
  });
});
