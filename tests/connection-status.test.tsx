// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  ConnectionStatus,
  connectionState,
} from "../src/renderer/ConnectionStatus.tsx";

afterEach(cleanup);

describe("connectionState", () => {
  it("maps starting to a connecting state", () => {
    expect(connectionState("starting")).toEqual({
      state: "connecting",
      label: "Connecting",
    });
  });

  it("maps idle and working to a connected state", () => {
    expect(connectionState("idle")).toEqual({ state: "connected", label: "Connected" });
    expect(connectionState("working")).toEqual({ state: "connected", label: "Working" });
  });

  it("maps error and exited to an error state", () => {
    expect(connectionState("error").state).toBe("error");
    expect(connectionState("exited").state).toBe("error");
  });

  it("treats cancelling as connected but still labels it", () => {
    expect(connectionState("cancelling")).toEqual({
      state: "connected",
      label: "Cancelling",
    });
  });
});

describe("ConnectionStatus", () => {
  it("renders a dot classed and labelled from the status", () => {
    const { container } = render(<ConnectionStatus status="working" />);
    const dot = container.querySelector(".conn-dot");
    expect(dot).toBeTruthy();
    expect(dot!.classList.contains("connected")).toBe(true);
    expect(dot!.getAttribute("aria-label")).toContain("Working");
    expect(dot!.getAttribute("title")).toBeTruthy();
  });

  it("uses the error class for a failed session", () => {
    const { container } = render(<ConnectionStatus status="error" />);
    expect(container.querySelector(".conn-dot.error")).toBeTruthy();
    expect(container.querySelector(".conn-dot")!.getAttribute("role")).toBe("img");
  });
});
