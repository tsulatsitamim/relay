import { describe, expect, it, vi } from "vitest";
import { notifyTurnFinished, type NotifyDeps } from "../src/main/notify.ts";

function deps(over: Partial<NotifyDeps> = {}): NotifyDeps {
  return {
    isSupported: () => true,
    isFocused: () => false,
    notify: vi.fn(),
    focusWindow: vi.fn(),
    ...over,
  };
}

describe("notifyTurnFinished", () => {
  it("shows a notification with the given title and body when supported and unfocused", () => {
    const d = deps();
    const shown = notifyTurnFinished(d, { title: "Fix auth", body: "Finished" });
    expect(shown).toBe(true);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(d.notify).toHaveBeenCalledWith({
      title: "Fix auth",
      body: "Finished",
      onClick: expect.any(Function),
    });
  });

  it("does nothing when notifications are unsupported", () => {
    const d = deps({ isSupported: () => false });
    expect(notifyTurnFinished(d, { title: "Fix auth", body: "Finished" })).toBe(false);
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("does nothing when a window is focused", () => {
    const d = deps({ isFocused: () => true });
    expect(notifyTurnFinished(d, { title: "Fix auth", body: "Finished" })).toBe(false);
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("focuses the app window when the notification is clicked", () => {
    const d = deps();
    notifyTurnFinished(d, { title: "Fix auth", body: "Finished" });
    const options = (d.notify as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      onClick: () => void;
    };
    options.onClick();
    expect(d.focusWindow).toHaveBeenCalledTimes(1);
  });
});
