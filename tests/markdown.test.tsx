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

  it("wraps tables in a scroll container so wide tables do not overflow", () => {
    const { container } = render(
      <Markdown text={"| a | b |\n| - | - |\n| 1 | 2 |"} />,
    );
    const wrap = container.querySelector(".table-scroll");
    expect(wrap).toBeTruthy();
    expect(wrap?.querySelector("table")).toBeTruthy();
  });

  it("renders inline code", () => {
    render(<Markdown text={"use `npm test` now"} />);
    expect(screen.getByText("npm test").tagName).toBe("CODE");
  });

  it("renders images lazily inside a new-tab link", () => {
    const { container } = render(
      <Markdown text={"![shot](https://example.com/a.png)"} />,
    );
    const img = container.querySelector("img.md-img") as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute("loading")).toBe("lazy");
    const link = img?.closest("a");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
    expect(link?.getAttribute("href")).toBe("https://example.com/a.png");
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("renders nothing for an image with a missing or blank source", () => {
    const { container } = render(<Markdown text={"![]()"} />);
    expect(container.querySelector("img.md-img")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("does not nest anchors for a linked image", () => {
    const { container } = render(
      <Markdown
        text={"[![shot](https://example.com/a.png)](https://site.example/page)"}
      />,
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.getAttribute("href")).toBe("https://site.example/page");
    expect(container.querySelector("img.md-img")).toBeTruthy();
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
