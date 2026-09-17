// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PermissionCard } from "../src/renderer/PermissionCard.tsx";
import type { PermissionRequest } from "../src/shared/types.ts";

afterEach(cleanup);

const request: PermissionRequest = {
  id: "p1",
  sessionId: "s1",
  title: "Edit README.md",
  kind: "edit",
  options: [
    { optionId: "allow", name: "Allow once", kind: "allow_once" },
    { optionId: "reject", name: "Reject", kind: "reject_once" },
  ],
};

describe("PermissionCard", () => {
  it("answers the current request when an option is clicked", () => {
    const onAnswer = vi.fn();
    render(<PermissionCard request={request} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onAnswer).toHaveBeenCalledWith("p1", "allow");
  });

  it("invokes onAllowAll with the auto-allow option when clicked", () => {
    const onAnswer = vi.fn();
    const onAllowAll = vi.fn();
    render(
      <PermissionCard request={request} onAnswer={onAnswer} onAllowAll={onAllowAll} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Allow all for this session" }),
    );
    expect(onAllowAll).toHaveBeenCalledWith("p1", "allow");
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("hides the allow-all control when no handler is provided", () => {
    render(<PermissionCard request={request} onAnswer={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Allow all for this session" }),
    ).toBeNull();
  });

  it("renders a numeric hint on each option", () => {
    const { container } = render(<PermissionCard request={request} onAnswer={vi.fn()} />);
    const hints = Array.from(container.querySelectorAll(".permission-key")).map(
      (node) => node.textContent,
    );
    expect(hints).toEqual(["1", "2"]);
  });

  it("answers the matching option when a digit is pressed", () => {
    const onAnswer = vi.fn();
    render(<PermissionCard request={request} onAnswer={onAnswer} />);
    fireEvent.keyDown(window, { key: "1" });
    expect(onAnswer).toHaveBeenCalledWith("p1", "allow");
    onAnswer.mockClear();
    fireEvent.keyDown(window, { key: "2" });
    expect(onAnswer).toHaveBeenCalledWith("p1", "reject");
  });

  it("ignores a digit with a modifier held", () => {
    const onAnswer = vi.fn();
    render(<PermissionCard request={request} onAnswer={onAnswer} />);
    fireEvent.keyDown(window, { key: "1", metaKey: true });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("ignores a digit typed into a text field", () => {
    const onAnswer = vi.fn();
    render(<PermissionCard request={request} onAnswer={onAnswer} />);
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "1" });
    input.remove();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("removes the key listener on unmount", () => {
    const onAnswer = vi.fn();
    const { unmount } = render(<PermissionCard request={request} onAnswer={onAnswer} />);
    unmount();
    fireEvent.keyDown(window, { key: "1" });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("ignores digits on an inactive card", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <PermissionCard request={request} onAnswer={first} active />
        <PermissionCard request={{ ...request, id: "p2" }} onAnswer={second} active={false} />
      </>,
    );
    fireEvent.keyDown(window, { key: "1" });
    expect(first).toHaveBeenCalledWith("p1", "allow");
    expect(second).not.toHaveBeenCalled();
  });

  it("steps between cards with the arrow keys", () => {
    const onStep = vi.fn();
    render(
      <PermissionCard
        request={request}
        onAnswer={vi.fn()}
        onStep={onStep}
        position={{ index: 0, total: 2 }}
      />,
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onStep).toHaveBeenCalledWith(1);
    onStep.mockClear();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it("shows the active position when more than one card is pending", () => {
    render(
      <PermissionCard
        request={request}
        onAnswer={vi.fn()}
        position={{ index: 1, total: 3 }}
      />,
    );
    expect(screen.getByText("2 of 3")).toBeTruthy();
  });
});

const NOTE = "Grants access for the rest of this session without asking again.";

const persistent: PermissionRequest = {
  id: "p2",
  sessionId: "s1",
  title: "Run command",
  kind: "execute",
  options: [
    { optionId: "always", name: "Allow always", kind: "allow_always" },
    { optionId: "once", name: "Allow once", kind: "allow_once" },
    { optionId: "reject", name: "Reject", kind: "reject_once" },
  ],
};

describe("PermissionCard permanent grants", () => {
  it("warns on a persistent allow option", () => {
    const { container } = render(
      <PermissionCard request={persistent} onAnswer={vi.fn()} />,
    );
    const warned = container.querySelectorAll(".permission-btn.warn");
    expect(warned).toHaveLength(1);
    expect(warned[0]!.querySelector(".permission-warn")).toBeTruthy();
    expect(warned[0]!.getAttribute("title")).toBe(NOTE);
    expect(screen.getByRole("button", { name: "Allow always" })).toBe(warned[0]);
  });

  it("does not warn on a one-time allow", () => {
    render(<PermissionCard request={persistent} onAnswer={vi.fn()} />);
    const once = screen.getByRole("button", { name: "Allow once" });
    expect(once.classList.contains("warn")).toBe(false);
    expect(once.querySelector(".permission-warn")).toBeNull();
  });

  it("carries the same note on the session auto-approve button", () => {
    render(
      <PermissionCard request={persistent} onAnswer={vi.fn()} onAllowAll={vi.fn()} />,
    );
    const all = screen.getByRole("button", { name: "Allow all for this session" });
    expect(all.classList.contains("warn")).toBe(true);
    expect(all.querySelector(".permission-warn")).toBeTruthy();
    expect(all.getAttribute("title")).toBe(NOTE);
  });
});
