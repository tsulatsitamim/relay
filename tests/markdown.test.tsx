// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Markdown } from "../src/renderer/Markdown.tsx";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders headings and inline emphasis", () => {
    render(<Markdown text={"# Title\n\nHello **world**"} />);
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeTruthy();
    expect(screen.getByText("world").tagName).toBe("STRONG");
  });

  it("renders github-flavored tables", () => {
    render(<Markdown text={"| a | b |\n| - | - |\n| 1 | 2 |"} />);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("renders inline code", () => {
    render(<Markdown text={"use `npm test` now"} />);
    expect(screen.getByText("npm test").tagName).toBe("CODE");
  });

  it("renders a fenced code block with a language label and copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Markdown text={"```js\nconst x = 1;\n```"} />);

    expect(screen.getByText("js")).toBeTruthy();
    const button = screen.getByRole("button", { name: /copy/i });
    await userEvent.click(button);
    expect(writeText).toHaveBeenCalledWith("const x = 1;");
  });
});
