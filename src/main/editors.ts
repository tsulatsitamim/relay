import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { hasBinaryOnPath } from "./agents.ts";
import { resolveWithinReal } from "./open-path.ts";
import {
  EDITORS,
  editorArgs,
  type EditorDefinition,
  type EditorInfo,
  type OpenInEditorResult,
} from "../shared/editors.ts";

type SpawnLike = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: "ignore"; shell: boolean },
) => { unref: () => void };

type Deps = {
  onPath?: (command: string) => boolean;
  exists?: (path: string) => boolean;
  spawn?: SpawnLike;
};

export function resolveCommand(
  editor: EditorDefinition,
  onPath: (command: string) => boolean = hasBinaryOnPath,
  exists: (path: string) => boolean = existsSync,
): string | null {
  if (onPath(editor.command)) return editor.command;
  if (editor.appPath && exists(editor.appPath)) return editor.appPath;
  return null;
}

export function availableEditors(
  onPath: (command: string) => boolean = hasBinaryOnPath,
  exists: (path: string) => boolean = existsSync,
): EditorInfo[] {
  const found: EditorInfo[] = [];
  for (const editor of EDITORS) {
    if (!resolveCommand(editor, onPath, exists)) continue;
    found.push({ id: editor.id, label: editor.label, command: editor.command });
  }
  return found;
}

export function openInEditor(
  cwd: string,
  editorId: string,
  path?: string | null,
  line?: number | null,
  deps: Deps = {},
): OpenInEditorResult {
  const spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnLike);
  const editor = EDITORS.find((entry) => entry.id === editorId);
  if (!editor) return { ok: false, message: `Unknown editor: ${editorId}` };
  const command = resolveCommand(editor, deps.onPath, deps.exists);
  if (!command) return { ok: false, message: `${editor.label} is not installed` };
  let target = cwd;
  if (path) {
    const resolved = resolveWithinReal(cwd, path);
    if (!resolved) {
      return { ok: false, message: "The file is outside the working directory" };
    }
    target = resolved;
  }
  try {
    spawn(command, editorArgs(editor, target, line ?? null), {
      detached: true,
      stdio: "ignore",
      shell: false,
    }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
