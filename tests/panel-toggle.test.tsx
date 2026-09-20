// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PanelToggle } from "../src/renderer/right-panel/PanelToggle.tsx";

afterEach(cleanup);

describe("PanelToggle", () => {
  it("reflects the pressed state and toggles", () => {
    const onToggle = vi.fn();
    render(<PanelToggle pressed={false} count={0} disabled={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: /Toggle right panel/ });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows the changed file count while closed and caps it at 99+", () => {
    const { rerender } = render(
      <PanelToggle pressed={false} count={3} disabled={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("3")).toBeTruthy();
    rerender(<PanelToggle pressed={true} count={3} disabled={false} onToggle={() => {}} />);
    expect(screen.queryByText("3")).toBeNull();
    rerender(
      <PanelToggle pressed={false} count={120} disabled={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("is disabled without a session", () => {
    render(<PanelToggle pressed={false} count={0} disabled={true} onToggle={() => {}} />);
    expect(
      (screen.getByRole("button", { name: /Toggle right panel/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
