// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "../src/renderer/Composer";
import type { SessionConfigOption } from "../src/shared/types";

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

  it("offers edit and send-next actions on queued chips", () => {
    const onEditQueued = vi.fn();
    const onSendQueued = vi.fn();
    const onSendQueuedNow = vi.fn();
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        queued={["first", "second"]}
        onEditQueued={onEditQueued}
        onSendQueued={onSendQueued}
        onSendQueuedNow={onSendQueuedNow}
      />,
    );
    fireEvent.click(screen.getAllByLabelText("Edit queued message")[1]);
    expect(onEditQueued).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getAllByLabelText("Send queued message next")[0]);
    expect(onSendQueued).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getAllByLabelText("Send queued message now")[1]);
    expect(onSendQueuedNow).toHaveBeenCalledWith(1);
  });

  it("hides the queued chip actions without handlers", () => {
    render(
      <Composer
        disabled={false}
        working={false}
        onSend={vi.fn()}
        onCancel={noop}
        queued={["only"]}
      />,
    );
    expect(screen.queryByLabelText("Edit queued message")).toBeNull();
    expect(screen.queryByLabelText("Send queued message next")).toBeNull();
    expect(screen.queryByLabelText("Send queued message now")).toBeNull();
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

describe("Composer prompt history", () => {
  function caretStart(field: HTMLTextAreaElement) {
    field.setSelectionRange(0, 0);
  }

  it("recalls the last prompt when ArrowUp is pressed at the caret start", () => {
    const { field } = setup({ history: ["latest prompt", "older prompt"] });
    caretStart(field);
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.value).toBe("latest prompt");

    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.value).toBe("older prompt");
  });

  it("returns to the draft with ArrowDown", () => {
    const { field } = setup({ history: ["latest prompt"] });
    fireEvent.change(field, { target: { value: "my draft" } });
    caretStart(field);
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.value).toBe("latest prompt");

    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.value).toBe("my draft");
  });

  it("does not recall when the caret is in the middle of the text", () => {
    const { field } = setup({ history: ["latest prompt"] });
    fireEvent.change(field, { target: { value: "abc def" } });
    field.setSelectionRange(3, 3);
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.value).toBe("abc def");
  });

  it("resets the walk when the user types again", () => {
    const { field } = setup({ history: ["latest prompt"] });
    caretStart(field);
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.value).toBe("latest prompt");

    fireEvent.change(field, { target: { value: "edited" } });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.value).toBe("edited");
  });
});

describe("Composer resting", () => {
  function card(container: HTMLElement): HTMLElement {
    return container.querySelector(".composer-card") as HTMLElement;
  }

  it("marks the composer resting when idle, empty, unfocused, and not hovered", () => {
    const { container } = setup({ resting: true });
    expect(card(container).getAttribute("data-resting")).toBe("true");
  });

  it("does not rest when the resting prop is false", () => {
    const { container } = setup({ resting: false });
    expect(card(container).getAttribute("data-resting")).toBeNull();
  });

  it("does not rest while working", () => {
    const { container } = setup({ resting: true, working: true });
    expect(card(container).getAttribute("data-resting")).toBeNull();
  });

  it("does not rest when text is present", () => {
    const { container, field } = setup({ resting: true });
    fireEvent.change(field, { target: { value: "hi" } });
    expect(card(container).getAttribute("data-resting")).toBeNull();
  });

  it("does not rest when an attachment is present", async () => {
    const pickImages = vi
      .fn()
      .mockResolvedValue([{ name: "shot.png", mimeType: "image/png", data: "AAAA" }]);
    // @ts-expect-error test shim
    window.relay = { pickImages };
    const { container } = setup({ resting: true });
    fireEvent.click(screen.getByLabelText("Attach image"));
    await screen.findByText("shot.png");
    expect(card(container).getAttribute("data-resting")).toBeNull();
  });

  it("does not rest while the field is focused", () => {
    const { container, field } = setup({ resting: true });
    fireEvent.focus(field);
    expect(card(container).getAttribute("data-resting")).toBeNull();
  });

  it("expands on hover and rests again when the pointer leaves", () => {
    const { container } = setup({ resting: true });
    expect(card(container).getAttribute("data-resting")).toBe("true");
    fireEvent.mouseEnter(card(container));
    expect(card(container).getAttribute("data-resting")).toBeNull();
    fireEvent.mouseLeave(card(container));
    expect(card(container).getAttribute("data-resting")).toBe("true");
  });
});

describe("Composer banners", () => {
  it("renders banners above the queued chips", () => {
    const { container } = setup({
      queued: ["queued one"],
      banners: <div data-testid="banner">banner</div>,
    });
    const banner = screen.getByTestId("banner");
    const chips = container.querySelector(".composer-queued");
    expect(chips).toBeTruthy();
    expect(
      banner.compareDocumentPosition(chips as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("Composer config chips", () => {
  const option: SessionConfigOption = {
    id: "model",
    name: "Model",
    type: "select",
    currentValue: "a",
    values: [
      { value: "a", name: "Alpha" },
      { value: "b", name: "Beta" },
    ],
  };

  it("renders a chip per non-mode config option", () => {
    const { container } = setup({
      configOptions: [option, { ...option, id: "effort", name: "Effort" }],
      onSetConfig: vi.fn(),
    });
    expect(container.querySelector(".config-row")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Model: Alpha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Effort: Alpha" })).toBeTruthy();
  });

  it("excludes the mode option", () => {
    const { container } = setup({
      configOptions: [{ ...option, id: "mode", name: "Mode" }],
      onSetConfig: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: "Mode: Alpha" })).toBeNull();
    expect(container.querySelector(".config-row")).toBeNull();
  });

  it("calls onSetConfig with the config id and value", async () => {
    const onSetConfig = vi.fn();
    setup({ configOptions: [option], onSetConfig });
    await userEvent.click(screen.getByRole("button", { name: "Model: Alpha" }));
    await userEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(onSetConfig).toHaveBeenCalledWith("model", "b");
  });

  it("disables chips while working", () => {
    setup({ working: true, configOptions: [option], onSetConfig: vi.fn() });
    const chip = screen.getByRole("button", {
      name: "Model: Alpha",
    }) as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
  });

  it("renders nothing without options or a handler", () => {
    const first = setup();
    expect(first.container.querySelector(".config-row")).toBeNull();
    cleanup();
    const second = setup({ configOptions: [option] });
    expect(second.container.querySelector(".config-row")).toBeNull();
  });
});
