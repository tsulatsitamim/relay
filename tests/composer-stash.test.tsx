// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "../src/renderer/Composer.tsx";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});

function Harness() {
  const [stash, setStash] = useState<string | null>(null);
  return (
    <Composer
      disabled={false}
      working={false}
      onSend={vi.fn()}
      onCancel={() => {}}
      stash={stash}
      onStash={(text) => setStash(text)}
      onRestoreStash={() => setStash(null)}
    />
  );
}

describe("Composer draft stash", () => {
  it("stashes the draft with Cmd+S and shows the indicator", () => {
    render(<Harness />);
    const box = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "my draft" } });

    fireEvent.keyDown(box, { key: "s", metaKey: true });
    expect(box.value).toBe("");
    expect(screen.getByText("Draft stashed")).toBeTruthy();
  });

  it("restores the stash when the same shortcut is pressed again", () => {
    render(<Harness />);
    const box = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "my draft" } });
    fireEvent.keyDown(box, { key: "s", metaKey: true });
    expect(box.value).toBe("");

    fireEvent.keyDown(box, { key: "s", metaKey: true });
    expect(box.value).toBe("my draft");
    expect(screen.queryByText("Draft stashed")).toBeNull();
  });

  it("restores the stash from the indicator button", () => {
    render(<Harness />);
    const box = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "my draft" } });
    fireEvent.keyDown(box, { key: "s", metaKey: true });

    fireEvent.click(screen.getByRole("button", { name: "Restore stashed draft" }));
    expect(box.value).toBe("my draft");
  });
});
