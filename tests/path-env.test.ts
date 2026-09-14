import { describe, expect, it } from "vitest";
import { mergePath } from "../src/main/path-env.ts";

describe("mergePath", () => {
  it("puts login-shell dirs first and deduplicates", () => {
    expect(mergePath("/opt/homebrew/bin:/usr/bin", "/usr/bin:/usr/sbin")).toBe(
      "/opt/homebrew/bin:/usr/bin:/usr/sbin",
    );
  });
});
