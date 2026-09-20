export type EditorLaunchStyle = "goto" | "direct" | "line-column";

export type EditorDefinition = {
  id: string;
  label: string;
  command: string;
  appPath: string;
  style: EditorLaunchStyle;
};

export type EditorInfo = {
  id: string;
  label: string;
  command: string;
};

export type OpenInEditorResult = { ok: true } | { ok: false; message: string };

export const EDITORS: readonly EditorDefinition[] = [
  {
    id: "vscode",
    label: "VS Code",
    command: "code",
    appPath: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    style: "goto",
  },
  {
    id: "cursor",
    label: "Cursor",
    command: "cursor",
    appPath: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    style: "goto",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    command: "windsurf",
    appPath: "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
    style: "goto",
  },
  {
    id: "zed",
    label: "Zed",
    command: "zed",
    appPath: "/Applications/Zed.app/Contents/MacOS/cli",
    style: "direct",
  },
  {
    id: "webstorm",
    label: "WebStorm",
    command: "webstorm",
    appPath: "",
    style: "line-column",
  },
  {
    id: "idea",
    label: "IntelliJ IDEA",
    command: "idea",
    appPath: "",
    style: "line-column",
  },
];

export type EditorId = string;

export function editorArgs(
  editor: EditorDefinition,
  target: string,
  line?: number | null,
): string[] {
  if (line && editor.style === "goto") return ["--goto", `${target}:${line}:1`];
  if (line && editor.style === "line-column") return ["--line", String(line), target];
  return [target];
}
