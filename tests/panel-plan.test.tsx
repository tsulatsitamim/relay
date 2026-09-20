// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PanelPlan } from "../src/renderer/right-panel/PanelPlan.tsx";

afterEach(cleanup);

describe("PanelPlan", () => {
  it("shows the current plan entries", () => {
    render(
      <PanelPlan
        entries={[
          { content: "Read the spec", status: "completed" },
          { content: "Ship the panel", status: "in_progress" },
        ]}
      />,
    );
    expect(screen.getByText("Read the spec")).toBeTruthy();
    expect(screen.getByText("Ship the panel")).toBeTruthy();
  });

  it("shows an empty state when there is no plan", () => {
    render(<PanelPlan entries={[]} />);
    expect(screen.getByText("No plan yet")).toBeTruthy();
  });
});
