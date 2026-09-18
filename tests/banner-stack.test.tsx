// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BannerStack, type BannerItem } from "../src/renderer/BannerStack";

afterEach(cleanup);

function item(
  id: string,
  kind: BannerItem["kind"],
  label: string,
): BannerItem {
  return { id, kind, node: <span>{label}</span> };
}

describe("BannerStack", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<BannerStack items={[]} />);
    expect(container.querySelector(".banner-stack")).toBeNull();
  });

  it("orders slots approval, error, tasks regardless of input order", () => {
    const { container } = render(
      <BannerStack
        items={[
          item("t1", "tasks", "task"),
          item("e1", "error", "error"),
          item("a1", "approval", "approval"),
        ]}
      />,
    );
    const kinds = Array.from(container.querySelectorAll(".banner-slot")).map(
      (slot) => slot.getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["approval", "error", "tasks"]);
  });

  it("orders auth before approval, error, and tasks", () => {
    const { container } = render(
      <BannerStack
        items={[
          item("t1", "tasks", "task"),
          item("e1", "error", "error"),
          item("a1", "approval", "approval"),
          item("au1", "auth", "auth"),
        ]}
      />,
    );
    const kinds = Array.from(container.querySelectorAll(".banner-slot")).map(
      (slot) => slot.getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["auth", "approval", "error", "tasks"]);
  });

  it("preserves input order within a kind", () => {
    const { container } = render(
      <BannerStack
        items={[
          item("a1", "approval", "first"),
          item("a2", "approval", "second"),
          item("a3", "approval", "third"),
        ]}
      />,
    );
    const texts = Array.from(container.querySelectorAll(".banner-slot")).map(
      (slot) => slot.textContent,
    );
    expect(texts).toEqual(["first", "second", "third"]);
  });

  it("caps the stack with a peek header above three items", () => {
    const { container } = render(
      <BannerStack
        items={[
          item("a1", "approval", "one"),
          item("e1", "error", "two"),
          item("t1", "tasks", "three"),
          item("t2", "tasks", "four"),
          item("t3", "tasks", "five"),
        ]}
      />,
    );
    expect(
      container.querySelector(".banner-stack")?.getAttribute("data-peek"),
    ).toBe("true");
    expect(container.querySelector(".banner-peek")?.textContent).toBe("2 more");
  });

  it("does not cap at three items", () => {
    const { container } = render(
      <BannerStack
        items={[
          item("a1", "approval", "one"),
          item("e1", "error", "two"),
          item("t1", "tasks", "three"),
        ]}
      />,
    );
    expect(
      container.querySelector(".banner-stack")?.getAttribute("data-peek"),
    ).toBeNull();
    expect(container.querySelector(".banner-peek")).toBeNull();
  });

  it("wraps every slot node in the animation inner element", () => {
    const { container } = render(
      <BannerStack
        items={[item("a1", "approval", "one"), item("e1", "error", "two")]}
      />,
    );
    const slots = Array.from(container.querySelectorAll(".banner-slot"));
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot.querySelector(":scope > .banner-slot-inner")).toBeTruthy();
    }
  });

  it("renders each node inside its slot", () => {
    render(<BannerStack items={[item("a1", "approval", "hello")]} />);
    expect(screen.getByText("hello")).toBeTruthy();
  });
});