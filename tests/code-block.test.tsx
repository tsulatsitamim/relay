// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CodeBlock } from "../src/renderer/CodeBlock.tsx";

const scrollIntoView = vi.fn();

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: scrollIntoView,
    writable: true,
    configurable: true,
  });
  scrollIntoView.mockClear();
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe("CodeBlock line reveal", () => {
  it("anchors each line with data-line and scrolls the requested line into view", () => {
    const { container } = render(
      <CodeBlock
        code={"const a = 1;\nconst b = 2;\nconst c = 3;\n"}
        lang="typescript"
        revealLine={2}
      />,
    );
    const anchors = container.querySelectorAll("[data-line]");
    expect(anchors.length).toBe(4);
    expect(anchors[1]!.getAttribute("data-line")).toBe("2");
    expect(anchors[1]!.textContent).toContain("const");
    expect(anchors[1]!.textContent).toContain("2");
    const scrolled = scrollIntoView.mock.instances.find(
      (node) => node instanceof HTMLElement && node.dataset.line === "2",
    );
    expect(scrolled).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("falls back to per-line plain text when highlighting spans lines unevenly", () => {
    const { container } = render(
      <CodeBlock
        code={"const s = `a\nb`;\n"}
        lang="typescript"
        revealLine={2}
      />,
    );
    const anchors = container.querySelectorAll("[data-line]");
    expect(anchors.length).toBe(3);
    expect(anchors[1]!.textContent).toContain("b`;");
    expect(anchors[0]!.textContent).toContain("const s = `a");
    expect(container.querySelector("code")!.innerHTML).not.toContain("hljs-keyword");
  });

  it("renders highlighted markup for the revealed line instead of literal tags", () => {
    const { container } = render(
      <CodeBlock
        code={"const a = 1;\nconst b = 2;\n"}
        lang="typescript"
        revealLine={2}
      />,
    );
    const revealed = container.querySelector('[data-line="2"]')!;
    expect(revealed.querySelector("span.hljs-keyword")).toBeTruthy();
    expect(revealed.textContent).toContain("const");
    expect(revealed.textContent).toContain("2");
    expect(container.textContent).not.toContain("<span");
    expect(container.querySelectorAll("[data-line]").length).toBe(3);
  });

  it("escapes the plain-text fallback exactly once", () => {
    const { container } = render(
      <CodeBlock
        code={"const s = `a\n<b>&x`;\n"}
        lang="typescript"
        revealLine={2}
      />,
    );
    const second = container.querySelector('[data-line="2"]')!;
    expect(second.textContent).toContain("<b>&x`;");
    expect(container.textContent).not.toContain("&lt;b&gt;");
    expect(container.textContent).not.toContain("<span");
    expect(container.querySelectorAll("[data-line]").length).toBe(3);
  });

  it("leaves highlighting intact when no reveal line is requested", () => {
    const { container } = render(
      <CodeBlock code={"const a = 1;\n"} lang="typescript" />,
    );
    expect(container.querySelectorAll("[data-line]").length).toBe(0);
    expect(container.querySelector("code")!.innerHTML).toContain("hljs-keyword");
  });
});
