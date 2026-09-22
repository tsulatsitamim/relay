// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PanelFile } from "../src/renderer/right-panel/PanelFile.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

const scrollIntoView = vi.fn();

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: scrollIntoView,
    writable: true,
    configurable: true,
  });
  scrollIntoView.mockClear();
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  delete (window as { relay?: unknown }).relay;
});

describe("PanelFile", () => {
  it("renders the file contents", async () => {
    window.relay = {
      readFile: async () => ({
        path: "src/app.ts",
        text: "const app = 1;\n",
        truncated: false,
        binary: false,
      }),
    } as unknown as RelayBridge;
    const { container } = render(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={null}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector(".code-body")?.textContent).toContain(
        "const app = 1;",
      ),
    );
  });

  it("reports binary and truncated files", async () => {
    window.relay = {
      readFile: async () => ({
        path: "logo.png",
        text: "",
        truncated: true,
        binary: true,
      }),
    } as unknown as RelayBridge;
    render(
      <PanelFile
        cwd="/repo"
        path="logo.png"
        revealLine={null}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText("Binary file")).toBeTruthy());
  });

  it("shows a notice when the file cannot be read", async () => {
    window.relay = {
      readFile: async () => null,
    } as unknown as RelayBridge;
    const { container } = render(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={null}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Unable to read this file")).toBeTruthy(),
    );
    expect(container.querySelector(".code-body")).toBeNull();
  });

  it("reveals the requested line by scrolling its anchor into view", async () => {
    window.relay = {
      readFile: async () => ({
        path: "src/app.ts",
        text: "one\ntwo\nthree\n",
        truncated: false,
        binary: false,
      }),
    } as unknown as RelayBridge;
    const { container } = render(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={3}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-line="3"]')).toBeTruthy(),
    );
    await waitFor(() => {
      const scrolled = scrollIntoView.mock.instances.find(
        (node) => node instanceof HTMLElement && node.dataset.line === "3",
      );
      expect(scrolled).toBeTruthy();
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("refetches when revealRequestId changes", async () => {
    const readFile = vi.fn(async () => ({
      path: "src/app.ts",
      text: "one\n",
      truncated: false,
      binary: false,
    }));
    window.relay = { readFile } as unknown as RelayBridge;
    const { rerender } = render(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={1}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(1));
    rerender(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={9}
        revealRequestId={1}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
  });
});
