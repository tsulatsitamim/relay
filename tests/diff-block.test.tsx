// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DiffBlock } from "../src/renderer/DiffBlock.tsx";

afterEach(cleanup);

describe("DiffBlock", () => {
  it("shows the path and add/remove counts", () => {
    const { container } = render(
      <DiffBlock path="src/a.ts" oldText={"a\nb\nc\n"} newText={"a\nB\nc\nd\n"} />,
    );
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();
    expect(container.querySelector(".diff-add")).toBeTruthy();
    expect(container.querySelector(".diff-del")).toBeTruthy();
  });
});
