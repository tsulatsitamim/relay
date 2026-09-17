import { describe, expect, it } from "vitest";
import {
  isPersistentAllow,
  permissionGrantNote,
  pickAutoAllowOption,
} from "../src/shared/permission.ts";

describe("pickAutoAllowOption", () => {
  it("prefers allow_always over allow_once", () => {
    const id = pickAutoAllowOption([
      { optionId: "once", name: "Allow once", kind: "allow_once" },
      { optionId: "always", name: "Allow always", kind: "allow_always" },
    ]);
    expect(id).toBe("always");
  });

  it("uses allow_once when that is the only allow option", () => {
    const id = pickAutoAllowOption([
      { optionId: "reject", name: "Reject", kind: "reject_once" },
      { optionId: "once", name: "Allow once", kind: "allow_once" },
    ]);
    expect(id).toBe("once");
  });

  it("falls back to the first option when no allow kind exists", () => {
    const id = pickAutoAllowOption([
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ]);
    expect(id).toBe("reject");
  });

  it("returns null for an empty option list", () => {
    expect(pickAutoAllowOption([])).toBeNull();
  });
});

const NOTE = "Grants access for the rest of this session without asking again.";

describe("isPersistentAllow", () => {
  it("flags allow_always", () => {
    expect(
      isPersistentAllow({ optionId: "a", name: "Allow", kind: "allow_always" }),
    ).toBe(true);
  });

  it("flags option names that promise to stop asking", () => {
    expect(
      isPersistentAllow({ optionId: "a", name: "Allow always", kind: "allow_once" }),
    ).toBe(true);
    expect(
      isPersistentAllow({ optionId: "a", name: "Don't ask again", kind: "allow_once" }),
    ).toBe(true);
    expect(
      isPersistentAllow({ optionId: "a", name: "Dont ask again", kind: "allow_once" }),
    ).toBe(true);
  });

  it("does not flag a one-time allow or a reject", () => {
    expect(
      isPersistentAllow({ optionId: "a", name: "Allow once", kind: "allow_once" }),
    ).toBe(false);
    expect(
      isPersistentAllow({ optionId: "r", name: "Reject", kind: "reject_once" }),
    ).toBe(false);
  });
});

describe("permissionGrantNote", () => {
  it("returns the session note for a persistent allow", () => {
    expect(
      permissionGrantNote({ optionId: "a", name: "Allow always", kind: "allow_always" }),
    ).toBe(NOTE);
  });

  it("returns null for a one-time allow", () => {
    expect(
      permissionGrantNote({ optionId: "a", name: "Allow once", kind: "allow_once" }),
    ).toBeNull();
  });
});
