// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "../src/renderer/Composer";

function setup(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(
    <Composer
      disabled={false}
      working={false}
      onSend={onSend}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSend, onCancel, field: screen.getByRole("textbox") as HTMLTextAreaElement };
}

afterEach(cleanup);
const noop = () => {};
describe("Composer", () => {
  it("sends on Enter", () => {
    const { onSend, field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("inserts a newline on Shift+Enter", () => {
    const { onSend, field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends on Cmd+Enter", () => {
    const { onSend, field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("does not send empty input", () => {
    const { onSend, field } = setup();
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows a Stop button while working that cancels", () => {
    const { onCancel, onSend } = setup({ working: true, disabled: true });
    const stop = screen.getByRole("button", { name: "Stop" });
    fireEvent.click(stop);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows the send orb when there is text and not working", () => {
    const { field } = setup();
    fireEvent.change(field, { target: { value: "hi" } });
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("shows the mic orb when idle and empty", () => {
    setup();
    expect(screen.getByRole("button", { name: "Voice" })).toBeTruthy();
  });

  it("enqueues instead of sending while working", () => {
    const onSend = vi.fn();
    const onQueue = vi.fn();
    render(
      <Composer
        disabled={false}
        working
        onSend={onSend}
        onCancel={noop}
        onQueue={onQueue}
      />,
    );
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "queue me" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onQueue).toHaveBeenCalledWith("queue me");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("renders queued chips with a remove control", () => {
    const onRemoveQueued = vi.fn();
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        queued={["first", "second"]}
        onRemoveQueued={onRemoveQueued}
      />,
    );
    expect(screen.getByText("first")).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText("Remove queued message")[1]);
    expect(onRemoveQueued).toHaveBeenCalledWith(1);
  });
});
