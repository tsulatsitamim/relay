import { describe, expect, it } from "vitest";
import {
  mcpServersFrom,
  mcpServersToAcp,
  type McpServerConfig,
} from "../src/shared/mcp.ts";

describe("mcpServersFrom", () => {
  it("returns an empty list for non-arrays", () => {
    expect(mcpServersFrom(undefined)).toEqual([]);
    expect(mcpServersFrom(null)).toEqual([]);
    expect(mcpServersFrom("nope")).toEqual([]);
    expect(mcpServersFrom({})).toEqual([]);
    expect(mcpServersFrom(42)).toEqual([]);
  });

  it("drops entries with an unknown kind", () => {
    expect(
      mcpServersFrom([
        { kind: "websocket", name: "sock", url: "ws://x" },
        { kind: "stdio", name: "fs", command: "npx" },
        { name: "fs", command: "npx" },
      ]),
    ).toEqual([
      { kind: "stdio", name: "fs", command: "npx", args: [], env: [] },
    ]);
  });

  it("drops stdio entries missing a name or command", () => {
    expect(
      mcpServersFrom([
        { kind: "stdio", name: "", command: "npx" },
        { kind: "stdio", name: "fs", command: "  " },
        { kind: "stdio", name: "ok", command: " npx " },
      ]),
    ).toEqual([
      { kind: "stdio", name: "ok", command: "npx", args: [], env: [] },
    ]);
  });

  it("drops http and sse entries missing a url", () => {
    expect(
      mcpServersFrom([
        { kind: "http", name: "a", url: "" },
        { kind: "sse", name: "b" },
        { kind: "http", name: "ok", url: " https://example.com/mcp " },
      ]),
    ).toEqual([
      {
        kind: "http",
        name: "ok",
        url: "https://example.com/mcp",
        headers: [],
      },
    ]);
  });

  it("keeps only string args and trims them", () => {
    expect(
      mcpServersFrom([
        {
          kind: "stdio",
          name: "fs",
          command: "npx",
          args: [" -y ", 7, null, "server-fs", ""],
        },
      ]),
    ).toEqual([
      {
        kind: "stdio",
        name: "fs",
        command: "npx",
        args: ["-y", "server-fs"],
        env: [],
      },
    ]);
  });

  it("sanitizes env entries and drops malformed ones", () => {
    expect(
      mcpServersFrom([
        {
          kind: "stdio",
          name: "fs",
          command: "npx",
          env: [
            { name: " ROOT ", value: " /tmp " },
            { name: "", value: "x" },
            { name: "MISSING" },
            { name: 3, value: "x" },
            "nope",
          ],
        },
      ]),
    ).toEqual([
      {
        kind: "stdio",
        name: "fs",
        command: "npx",
        args: [],
        env: [{ name: "ROOT", value: "/tmp" }],
      },
    ]);
  });

  it("sanitizes header entries for http and sse", () => {
    expect(
      mcpServersFrom([
        {
          kind: "sse",
          name: "remote",
          url: "https://example.com/sse",
          headers: [
            { name: "Authorization", value: "Bearer x" },
            { name: "  ", value: "y" },
            { name: "OnlyName" },
          ],
        },
      ]),
    ).toEqual([
      {
        kind: "sse",
        name: "remote",
        url: "https://example.com/sse",
        headers: [{ name: "Authorization", value: "Bearer x" }],
      },
    ]);
  });

  it("trims the name and returns valid stdio, http and sse configs", () => {
    const raw = [
      { kind: "stdio", name: " fs ", command: " npx ", args: [], env: [] },
      { kind: "http", name: "http", url: " https://h ", headers: [] },
      { kind: "sse", name: "sse", url: "https://s", headers: [] },
    ];
    expect(mcpServersFrom(raw)).toEqual([
      { kind: "stdio", name: "fs", command: "npx", args: [], env: [] },
      { kind: "http", name: "http", url: "https://h", headers: [] },
      { kind: "sse", name: "sse", url: "https://s", headers: [] },
    ]);
  });
});

describe("mcpServersToAcp", () => {
  it("maps stdio without a type field", () => {
    const configs: McpServerConfig[] = [
      {
        kind: "stdio",
        name: "fs",
        command: "npx",
        args: ["-y", "server-fs"],
        env: [{ name: "ROOT", value: "/tmp" }],
      },
    ];
    const wire = mcpServersToAcp(configs);
    expect(wire).toEqual([
      {
        name: "fs",
        command: "npx",
        args: ["-y", "server-fs"],
        env: [{ name: "ROOT", value: "/tmp" }],
      },
    ]);
    expect(wire[0]).not.toHaveProperty("type");
  });

  it("maps http and sse with their type field", () => {
    const configs: McpServerConfig[] = [
      {
        kind: "http",
        name: "h",
        url: "https://h",
        headers: [{ name: "A", value: "1" }],
      },
      { kind: "sse", name: "s", url: "https://s", headers: [] },
    ];
    expect(mcpServersToAcp(configs)).toEqual([
      {
        name: "h",
        url: "https://h",
        headers: [{ name: "A", value: "1" }],
        type: "http",
      },
      { name: "s", url: "https://s", headers: [], type: "sse" },
    ]);
  });
});
