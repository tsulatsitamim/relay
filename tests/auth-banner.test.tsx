// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthBanner } from "../src/renderer/AuthBanner";

afterEach(cleanup);

describe("AuthBanner", () => {
  it("renders one button per method and reports the chosen id", () => {
    const onLogin = vi.fn();
    render(
      <AuthBanner
        methods={[
          { id: "a", name: "Alpha" },
          { id: "b", name: "Beta", description: "Second" },
        ]}
        busy={false}
        onLogin={onLogin}
      />,
    );
    expect(screen.getByText("Authentication required")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Log in with Alpha" }));
    expect(onLogin).toHaveBeenCalledWith("a");

    fireEvent.click(screen.getByRole("button", { name: "Log in with Beta" }));
    expect(onLogin).toHaveBeenCalledWith("b");
  });

  it("renders the CLI hint when there are no methods", () => {
    render(<AuthBanner methods={[]} busy={false} onLogin={vi.fn()} />);
    expect(screen.getByText(/CLI/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("disables the login buttons while busy", () => {
    render(
      <AuthBanner methods={[{ id: "a", name: "Alpha" }]} busy onLogin={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: "Log in with Alpha" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the login error when set", () => {
    render(
      <AuthBanner
        methods={[{ id: "a", name: "Alpha" }]}
        busy={false}
        error="Login failed"
        onLogin={vi.fn()}
      />,
    );
    expect(document.querySelector(".auth-error")?.textContent).toBe("Login failed");
  });

  it("renders no error line when the error is absent", () => {
    render(
      <AuthBanner
        methods={[{ id: "a", name: "Alpha" }]}
        busy={false}
        error={null}
        onLogin={vi.fn()}
      />,
    );
    expect(document.querySelector(".auth-error")).toBeNull();
    expect(screen.queryByText("Login failed")).toBeNull();
  });
});
