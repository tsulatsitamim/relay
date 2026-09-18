// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigPicker } from "../src/renderer/ConfigPicker.tsx";
import type { SessionConfigOption } from "../src/shared/types.ts";

afterEach(cleanup);

function option(
  overrides: Partial<SessionConfigOption> = {},
): SessionConfigOption {
  return {
    id: "model",
    name: "Model",
    type: "select",
    currentValue: "a",
    values: [
      { value: "a", name: "Alpha", description: "The first model" },
      { value: "b", name: "Beta", description: "The second model" },
      { value: "c", name: "Gamma", description: "The third model" },
    ],
    ...overrides,
  };
}

describe("ConfigPicker", () => {
  it("renders the chip with the option name and current value name", () => {
    render(<ConfigPicker option={option()} onSelect={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "Model: Alpha" });
    expect(chip.className).toContain("config-chip");
    expect(chip.getAttribute("aria-haspopup")).toBe("listbox");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens a listbox with the values and marks the current one", async () => {
    render(<ConfigPicker option={option()} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Model: Alpha" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Model: Alpha" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("option", { name: /Alpha/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: /Beta/ }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("filters case-insensitively across value, name, and description", async () => {
    render(<ConfigPicker option={option()} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Model: Alpha" }));
    const input = screen.getByLabelText("Filter Model values");
    await userEvent.type(input, "third");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Gamma/ })).toBeTruthy();
    await userEvent.clear(input);
    await userEvent.type(input, "BETA");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Beta/ })).toBeTruthy();
  });

  it("moves the active row with wrapping and selects with Enter", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ConfigPicker option={option()} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Model: Alpha" }));
    const input = screen.getByLabelText("Filter Model values");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(container.querySelector(".config-option.active")?.textContent).toContain(
      "Gamma",
    );
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(container.querySelector(".config-option.active")?.textContent).toContain(
      "Alpha",
    );
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape and refocuses the chip", async () => {
    render(<ConfigPicker option={option()} onSelect={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "Model: Alpha" });
    await userEvent.click(chip);
    fireEvent.keyDown(screen.getByLabelText("Filter Model values"), {
      key: "Escape",
    });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it("closes when clicking outside the picker", async () => {
    render(<ConfigPicker option={option()} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Model: Alpha" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects with a click and closes", async () => {
    const onSelect = vi.fn();
    render(<ConfigPicker option={option()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Model: Alpha" }));
    await userEvent.click(screen.getByRole("option", { name: /Beta/ }));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("caps the rendered rows at 100 and shows a more hint", async () => {
    const values = Array.from({ length: 150 }, (_, index) => ({
      value: `v${index}`,
      name: `Value ${index}`,
    }));
    const { container } = render(
      <ConfigPicker
        option={option({ values, currentValue: "v0" })}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Model: Value 0" }));
    expect(container.querySelectorAll(".config-option")).toHaveLength(100);
    expect(screen.getByText("Showing first 100 matches")).toBeTruthy();
  });

  it("disables the chip when disabled", () => {
    render(<ConfigPicker option={option()} disabled onSelect={vi.fn()} />);
    expect(
      (screen.getByRole("button", { name: "Model: Alpha" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
