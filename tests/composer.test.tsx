// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Composer } from "../src/renderer/Composer";

function setup(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const { container } = render(
    <Composer
      disabled={false}
      working={false}
      onSend={onSend}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return {
    onSend,
    onCancel,
    container,
    field: screen.getByRole("textbox") as HTMLTextAreaElement,
  };
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

  it("clears all queued messages from one control", () => {
    const onClearQueued = vi.fn();
    const onRemoveQueued = vi.fn();
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        queued={["first", "second"]}
        onClearQueued={onClearQueued}
        onRemoveQueued={onRemoveQueued}
      />,
    );
    fireEvent.click(screen.getByLabelText("Clear queued messages"));
    expect(onClearQueued).toHaveBeenCalledTimes(1);
    expect(onRemoveQueued).not.toHaveBeenCalled();
  });

  it("hides the clear control when only one message is queued", () => {
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        queued={["only"]}
        onClearQueued={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Clear queued messages")).toBeNull();
  });

  it("offers slash commands and inserts a picked one into the input", () => {
    const onSend = vi.fn();
    const { container } = render(
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
    expect(container.querySelector(".command-badge")).toBeNull();
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
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith("look", [
        { name: "shot.png", mimeType: "image/png", data: "AAAA" },
      ]),
    );
  });

  it("sends text with no second argument when there are no attachments", () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} working={false} onSend={onSend} onCancel={noop} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "plain" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("plain");
  });

  it("does not pick a suggestion on Shift+Enter", () => {
    const onSend = vi.fn();
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={onSend}
        onCancel={noop}
        commands={[{ name: "init", description: "Create AGENTS.md" }]}
      />,
    );
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/in" } });
    expect(screen.getByText("/init")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(box.value).toBe("/in");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps the draft when Escape closes the slash menu", () => {
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        commands={[{ name: "init", description: "Create AGENTS.md" }]}
      />,
    );
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/in" } });
    expect(screen.getByText("/init")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByText("/init")).toBeNull();
    expect(box.value).toBe("/in");
  });

  it("keeps the draft when Escape closes the mention menu", async () => {
    const listFiles = vi.fn().mockResolvedValue(["src/index.ts"]);
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
    expect(await screen.findByText("src/index.ts")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByText("src/index.ts")).toBeNull();
    expect(box.value).toBe("look at @ind");
  });

  it("ignores a stale mention response", async () => {
    const pending = new Map<string, (value: string[]) => void>();
    const listFiles = vi.fn(
      (_cwd: string, query?: string) =>
        new Promise<string[]>((resolve) => {
          pending.set(query ?? "", resolve);
        }),
    );
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
    fireEvent.change(box, { target: { value: "@e" } });
    await waitFor(() => expect(listFiles).toHaveBeenCalledWith("/tmp/repo", "e"));
    fireEvent.change(box, { target: { value: "@ea" } });
    await waitFor(() => expect(listFiles).toHaveBeenCalledWith("/tmp/repo", "ea"));
    pending.get("ea")!(["early.ts"]);
    expect(await screen.findByText("early.ts")).toBeTruthy();
    pending.get("e")!(["late.ts"]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText("late.ts")).toBeNull();
    expect(screen.getByText("early.ts")).toBeTruthy();
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

  it("adds a thumbnail chip when an image is pasted", async () => {
    const { container, field } = setup();
    const file = new File([new Uint8Array([1, 2, 3])], "pasted.png", {
      type: "image/png",
    });
    fireEvent.paste(field, { clipboardData: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(screen.getByText("pasted.png")).toBeTruthy());
    const thumb = container.querySelector(".attach-thumb") as HTMLImageElement;
    expect(thumb).toBeTruthy();
    expect(thumb.getAttribute("src")).toBe("data:image/png;base64,AQID");
  });

  it("adds a thumbnail chip when an image is dropped", async () => {
    const { container } = setup();
    const file = new File([new Uint8Array([4, 5, 6])], "dropped.png", {
      type: "image/png",
    });
    fireEvent.drop(container.querySelector(".composer-card")!, {
      dataTransfer: { files: [file], types: ["Files"] },
    });
    await waitFor(() => expect(screen.getByText("dropped.png")).toBeTruthy());
    expect(container.querySelector(".attach-thumb")).toBeTruthy();
  });

  it("lets a text-only paste through without attaching", () => {
    const { container, field } = setup();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.assign(event, { clipboardData: { files: [], types: [] } });
    field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(container.querySelector(".attach-thumb")).toBeNull();
  });

  it("injects text and focuses the field when an inject arrives", () => {
    const onSend = vi.fn();
    const { rerender } = render(
      <Composer disabled={false} working={false} onSend={onSend} onCancel={noop} />,
    );
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    rerender(
      <Composer
        disabled={false}
        working={false}
        onSend={onSend}
        onCancel={noop}
        inject={{ text: "edited draft", nonce: 1 }}
      />,
    );
    expect(box.value).toBe("edited draft");
    expect(document.activeElement).toBe(box);
  });

  const commands = [
    { name: "init", description: "guided setup" },
    { name: "review", description: "review changes" },
  ];

  it("offers commands in the slash menu", () => {
    setup({ commands });
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "/" } });
    const labels = screen.getAllByRole("option").map((option) => option.textContent ?? "");
    expect(labels.some((label) => label.includes("/init"))).toBe(true);
    expect(labels.some((label) => label.includes("/review"))).toBe(true);
  });

  it("inserts the picked command into the input", () => {
    const { container } = setup({ commands });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/ini" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("/init ");
    expect(container.querySelector(".command-badge")).toBeNull();
  });

  it("picks a command with Tab", () => {
    const { container } = setup({ commands });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/rev" } });
    fireEvent.keyDown(box, { key: "Tab" });
    expect(box.value).toBe("/review ");
  });

  it("sends the picked command with the typed text", () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    setup({ commands, onSend });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/ini" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("/init ");
    fireEvent.change(box, { target: { value: `${box.value}hello` } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("/init hello");
    expect(box.value).toBe("");
  });
  it("sends a command-only prompt", () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    setup({ commands, onSend });
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "/ini" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("/init");
  });

  it("offers another command after a leading one", () => {
    setup({ commands });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/ini" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "/init /rev" } });
    expect(screen.getByText("/review")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("/init /review ");
  });

  it("highlights leading command tokens in the field mirror", () => {
    const { container } = setup({ commands });
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "/init hello" } });
    const mirror = container.querySelector(".composer-mirror");
    expect(mirror?.querySelector(".token")?.textContent).toBe("/init");
    expect(mirror?.textContent).toContain("hello");
  });

  it("does not highlight a slash token after prose", () => {
    const { container } = setup({ commands });
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "hello /init" } });
    expect(container.querySelector(".composer-mirror .token")).toBeNull();
  });

  it("does not offer commands after prose", () => {
    setup({ commands });
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "hello /ini" } });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("queues a command while working", () => {
    const onQueue = vi.fn();
    setup({ commands, working: true, onQueue });
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/ini" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: `${box.value}hello` } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onQueue).toHaveBeenCalledWith("/init hello");
  });

  it("sends only once when a second submit lands during attachment thumbnails", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const pickImages = vi
      .fn()
      .mockResolvedValue([{ name: "shot.png", mimeType: "image/png", data: "AAAA" }]);
    // @ts-expect-error test shim
    window.relay = { pickImages };
    render(<Composer disabled={false} working={false} onSend={onSend} onCancel={noop} />);
    fireEvent.click(screen.getByLabelText("Attach image"));
    expect(await screen.findByText("shot.png")).toBeTruthy();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "look" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith("look", [
      { name: "shot.png", mimeType: "image/png", data: "AAAA" },
    ]);
  });
});
