// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PanelFiles } from "../src/renderer/right-panel/PanelFiles.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

describe("PanelFiles", () => {
  it("lists files and opens one on click", async () => {
    window.relay = {
      listFiles: async (_cwd: string, query?: string) =>
        query ? ["src/app.ts"] : ["src/app.ts", "README.md"],
    } as unknown as RelayBridge;
    const onOpenFile = vi.fn();
    render(<PanelFiles cwd="/repo" onOpenFile={onOpenFile} />);
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    fireEvent.click(screen.getByText("src/app.ts"));
    expect(onOpenFile).toHaveBeenCalledWith("src/app.ts");
  });

  it("filters with the query", async () => {
    const listFiles = vi.fn(async (_cwd: string, query?: string) =>
      query ? ["src/app.ts"] : ["src/app.ts", "README.md"],
    );
    window.relay = { listFiles } as unknown as RelayBridge;
    render(<PanelFiles cwd="/repo" onOpenFile={() => {}} />);
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox", { name: "Filter files" }), {
      target: { value: "app" },
    });
    await waitFor(() =>
      expect(listFiles).toHaveBeenCalledWith("/repo", "app"),
    );
    expect(screen.queryByText("README.md")).toBeNull();
  });
});
