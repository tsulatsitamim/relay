// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SuggestionMenu } from "../src/renderer/SuggestionMenu.tsx";

afterEach(cleanup);

describe("SuggestionMenu", () => {
  it("renders labels and details", () => {
    render(
      <SuggestionMenu
        items={[
          { id: "init", label: "/init", detail: "Create AGENTS.md" },
          { id: "review", label: "/review", detail: "Review the diff" },
        ]}
        activeIndex={0}
        onPick={() => {}}
      />,
    );
    expect(screen.getByText("/init")).toBeTruthy();
    expect(screen.getByText("Create AGENTS.md")).toBeTruthy();
  });

  it("reports the picked index on click", () => {
    const onPick = vi.fn();
    render(
      <SuggestionMenu
        items={[
          { id: "init", label: "/init" },
          { id: "review", label: "/review" },
        ]}
        activeIndex={0}
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByText("/review"));
    expect(onPick).toHaveBeenCalledWith(1);
  });
});
