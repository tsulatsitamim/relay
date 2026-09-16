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
});
