import { describe, expect, it } from "vitest";
import { repoFor } from "../src/shared/repo.ts";

describe("repoFor", () => {
  const repos = [
    { path: "/tmp/relay", name: "relay", addedAt: 1 },
    { path: "/tmp/relay/apps", name: "apps", addedAt: 2 },
  ];

  it("matches exact and nested paths, preferring the longest repo", () => {
    expect(repoFor("/tmp/relay", repos)?.name).toBe("relay");
    expect(repoFor("/tmp/relay/", repos)?.name).toBe("relay");
    expect(repoFor("/tmp/relay/apps/web", repos)?.name).toBe("apps");
    expect(repoFor("/tmp/other", repos)).toBeUndefined();
  });
});
