// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { OverlayScrollbar } from "../src/renderer/OverlayScrollbar.tsx";

afterEach(cleanup);

describe("OverlayScrollbar", () => {
  it("renders a hidden thumb when the scroller is not scrollable", () => {
    const el = document.createElement("div");
    const { container } = render(<OverlayScrollbar scroller={() => el} />);
    const track = container.querySelector(".overlay-scroll-track");
    const thumb = container.querySelector(".overlay-thumb");
    expect(track).toBeTruthy();
    expect(track?.getAttribute("aria-hidden")).toBe("true");
    expect(thumb).toBeTruthy();
    expect(thumb?.getAttribute("data-visible")).toBe("false");
  });

  it("renders a hidden overlay when there is no scroller", () => {
    const { container } = render(<OverlayScrollbar scroller={() => null} />);
    expect(
      container.querySelector(".overlay-thumb")?.getAttribute("data-visible"),
    ).toBe("false");
  });

  it("does not crash when the track is clicked without a scroller", () => {
    const { container } = render(<OverlayScrollbar scroller={() => null} />);
    const track = container.querySelector(".overlay-scroll-track") as HTMLElement;
    expect(() => fireEvent.pointerDown(track, { clientY: 10 })).not.toThrow();
  });

  it("never makes the overlay focusable", () => {
    const el = document.createElement("div");
    const { container } = render(<OverlayScrollbar scroller={() => el} />);
    const track = container.querySelector(".overlay-scroll-track") as HTMLElement;
    expect(track.getAttribute("tabindex")).toBeNull();
  });
});