// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ErrorBanner } from "../src/renderer/ErrorBanner";

afterEach(cleanup);
describe("ErrorBanner", () => {
  it("shows the message as an alert", () => {
    render(<ErrorBanner message="boom" onRetry={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("boom");
  });

  it("retries on click", () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="boom" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
