// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "../src/renderer/ErrorBoundary";

afterEach(() => {
  cleanup();
});

function Boom(): ReactNode {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("shows the fallback message and a reload button when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      expect(screen.getByText(/unexpected error/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("renders healthy children normally", () => {
    render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeTruthy();
  });
});