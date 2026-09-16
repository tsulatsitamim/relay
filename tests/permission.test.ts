import { describe, expect, it } from "vitest";
import { pickAutoAllowOption } from "../src/shared/permission.ts";

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
