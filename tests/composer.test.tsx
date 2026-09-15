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

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});
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

  it("offers slash commands and picks one", () => {
    const onSend = vi.fn();
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={onSend}
        onCancel={noop}
        commands={[
          { name: "init", description: "Create AGENTS.md" },
          { name: "review", description: "Review the diff" },
        ]}
      />,
    );
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/in" } });
    expect(screen.getByText("/init")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("/init ");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("offers files for an @ token and picks one", async () => {
    const listFiles = vi.fn().mockResolvedValue(["src/index.ts", "README.md"]);
    // @ts-expect-error test shim
    window.relay = { listFiles };
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        cwd="/tmp/repo"
      />,
    );
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "look at @ind" } });
    const option = await screen.findByText("src/index.ts");
    fireEvent.click(option);
    expect(box.value).toBe("look at @src/index.ts ");
    expect(listFiles).toHaveBeenCalledWith("/tmp/repo", "ind");
  });

  it("inserts mention paths literally when they contain replacement tokens", async () => {
    const listFiles = vi.fn().mockResolvedValue(["a$&b.ts"]);
    // @ts-expect-error test shim
    window.relay = { listFiles };
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        cwd="/tmp/repo"
      />,
    );
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "see @a" } });
    const option = await screen.findByText("a$&b.ts");
    fireEvent.click(option);
    expect(box.value).toBe("see @a$&b.ts ");
  });

  it("attaches picked images and sends them", async () => {
    const onSend = vi.fn();
    const pickImages = vi
      .fn()
      .mockResolvedValue([{ name: "shot.png", mimeType: "image/png", data: "AAAA" }]);
    // @ts-expect-error test shim
    window.relay = { pickImages };
    render(<Composer disabled={false} working={false} onSend={onSend} onCancel={noop} />);
    fireEvent.click(screen.getByLabelText("Attach image"));
    expect(await screen.findByText("shot.png")).toBeTruthy();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "look" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("look", [
      { name: "shot.png", mimeType: "image/png", data: "AAAA" },
    ]);
  });

  it("sends text with no second argument when there are no attachments", () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} working={false} onSend={onSend} onCancel={noop} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "plain" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("plain");
  });

  it("keeps text and attachments intact when submitting while working", async () => {
    const onSend = vi.fn();
    const onQueue = vi.fn();
    const pickImages = vi
      .fn()
      .mockResolvedValue([{ name: "shot.png", mimeType: "image/png", data: "AAAA" }]);
    // @ts-expect-error test shim
    window.relay = { pickImages };
    render(
      <Composer
        disabled={false}
        working
        onSend={onSend}
        onCancel={noop}
        onQueue={onQueue}
      />,
    );
    fireEvent.click(screen.getByLabelText("Attach image"));
    expect(await screen.findByText("shot.png")).toBeTruthy();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "look" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onQueue).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe("look");
    expect(screen.getByText("shot.png")).toBeTruthy();
  });
});
