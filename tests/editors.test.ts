import { describe, expect, it, vi } from "vitest";
import { EDITORS, editorArgs } from "../src/shared/editors.ts";
import { availableEditors, openInEditor, resolveCommand } from "../src/main/editors.ts";

const vscode = EDITORS.find((editor) => editor.id === "vscode")!;
const zed = EDITORS.find((editor) => editor.id === "zed")!;
const webstorm = EDITORS.find((editor) => editor.id === "webstorm")!;

describe("editorArgs", () => {
  it("uses goto for VS Code style editors", () => {
    expect(editorArgs(vscode, "/tmp/a.ts", 12)).toEqual(["--goto", "/tmp/a.ts:12:1"]);
    expect(editorArgs(vscode, "/tmp/a.ts")).toEqual(["/tmp/a.ts"]);
    expect(editorArgs(vscode, "/tmp")).toEqual(["/tmp"]);
  });

  it("uses --line for JetBrains style editors", () => {
    expect(editorArgs(webstorm, "/tmp/a.ts", 7)).toEqual(["--line", "7", "/tmp/a.ts"]);
    expect(editorArgs(webstorm, "/tmp/a.ts")).toEqual(["/tmp/a.ts"]);
  });

  it("passes the path straight through for direct editors", () => {
    expect(editorArgs(zed, "/tmp/a.ts", 3)).toEqual(["/tmp/a.ts"]);
  });
});

describe("resolveCommand", () => {
  it("prefers a command on PATH and falls back to the app bundle", () => {
    expect(resolveCommand(vscode, () => true, () => false)).toBe("code");
    expect(resolveCommand(vscode, () => false, () => true)).toBe(vscode.appPath);
    expect(resolveCommand(vscode, () => false, () => false)).toBeNull();
  });
});

describe("availableEditors", () => {
  it("lists only detected editors", () => {
    const found = availableEditors((command) => command === "code", () => false);
    expect(found).toEqual([{ id: "vscode", label: "VS Code", command: "code" }]);
  });

  it("returns an empty list when nothing is installed", () => {
    expect(availableEditors(() => false, () => false)).toEqual([]);
  });
});

describe("openInEditor", () => {
  it("rejects unknown editors and missing binaries", () => {
    const spawn = vi.fn();
    expect(openInEditor("/tmp", "nope" as never, null, null, { spawn })).toEqual({
      ok: false,
      message: "Unknown editor: nope",
    });
    const result = openInEditor("/tmp", "vscode", null, null, {
      onPath: () => false,
      exists: () => false,
      spawn,
    });
    expect(result).toMatchObject({ ok: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects a path outside the working directory", () => {
    const spawn = vi.fn();
    const result = openInEditor("/tmp", "vscode", "../secret", null, {
      onPath: () => true,
      spawn,
    });
    expect(result).toMatchObject({ ok: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns detached and unrefs", () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref }));
    const result = openInEditor(process.cwd(), "vscode", "package.json", 4, {
      onPath: () => true,
      spawn,
    });
    expect(result).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledWith(
      "code",
      ["--goto", `${process.cwd()}/package.json:4:1`],
      { detached: true, stdio: "ignore", shell: false },
    );
    expect(unref).toHaveBeenCalled();
  });

  it("consumes asynchronous spawn errors instead of crashing", () => {
    const unref = vi.fn();
    const on = vi.fn();
    const spawn = vi.fn(() => ({ unref, on }));
    const result = openInEditor(process.cwd(), "vscode", "package.json", null, {
      onPath: () => true,
      spawn,
    });
    expect(result).toEqual({ ok: true });
    expect(on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(unref).toHaveBeenCalled();
  });
});
