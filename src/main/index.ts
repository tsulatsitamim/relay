import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  Notification,
  dialog,
  ipcMain,
  clipboard,
  shell,
  nativeTheme,
} from "electron";
import { applyLoginPath } from "./path-env.ts";
import { openStore } from "./db.ts";
import { SessionManager, defaultAgents } from "./session-manager.ts";
import {
  disableBuiltinClaudeAgent,
  hasBinaryOnPath,
  resolveClaudeAgent,
  upgradeClaudeAgent,
} from "./agents.ts";
import {
  findClaudeAdapter,
  installAndEnableClaudeAdapter,
} from "./claude-adapter.ts";
import { resolveWithinReal } from "./open-path.ts";
import {
  isTurnFinished,
  notifyTurnFinished,
  type NotifyDeps,
} from "./notify.ts";
import { createLogger } from "./logger.ts";
import { branchInfo, repoNameFromPath, withGitBranch } from "./repo-name.ts";
import { listFiles } from "./file-index.ts";
import { listSkills } from "./skills.ts";
import { readAttachment } from "./attachments.ts";
import type { CreatePayload, DiffCommentInput, RelayState } from "../shared/ipc.ts";
import type { AgentConfig, PromptAttachment, SessionStatus } from "../shared/types.ts";

type ThemeSource = "system" | "light" | "dark";

const LIGHT_BACKGROUND = "#F4F4F2";
const DARK_BACKGROUND = "#181818";

function normalizeStoredTheme(value: string | null | undefined): ThemeSource {
  return value === "light" || value === "dark" ? value : "system";
}

function resolveBackground(source: ThemeSource): string {
  const dark =
    source === "dark" || (source === "system" && nativeTheme.shouldUseDarkColors);
  return dark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}

function createWindow(backgroundColor: string): BrowserWindow {
  const dir = dirname(fileURLToPath(import.meta.url));
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 520,
    title: "Relay",
    backgroundColor,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(dir, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(dir, "../renderer/index.html"));
  }

  return win;
}

async function main(): Promise<void> {
  await app.whenReady();
  await applyLoginPath();

  const userData = app.getPath("userData");
  const toolsDir = join(userData, "tools");
  const logger = createLogger(join(userData, "relay.log"));
  const dbPath = join(userData, "relay.db");
  const store = await openStore(dbPath);
  const existingAgents = store.listAgents();
  if (existingAgents.length === 0) {
    store.saveAgents(defaultAgents());
  } else {
    const upgraded = upgradeClaudeAgent(
      existingAgents,
      resolveClaudeAgent(hasBinaryOnPath),
    );
    const migrated = disableBuiltinClaudeAgent(
      upgraded,
      findClaudeAdapter(toolsDir) !== null,
    );
    if (migrated !== existingAgents) store.saveAgents(migrated);
  }

  const manager = new SessionManager(store);
  let shuttingDown = false;

  const windows = new Set<BrowserWindow>();

  const broadcast = (channel: string, payload: unknown) => {
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  };

  const notifyDeps: NotifyDeps = {
    isSupported: () => Notification.isSupported(),
    isFocused: () =>
      [...windows].some((win) => !win.isDestroyed() && win.isFocused()),
    notify: ({ title, body, onClick }) => {
      const notification = new Notification({ title, body });
      notification.on("click", onClick);
      notification.show();
    },
    focusWindow: () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
  };
  const lastStatus = new Map<string, SessionStatus>();

  manager.onEvent((event) => {
    if (event.type === "log") logger.info(event.message, { sessionId: event.sessionId });
    if (event.type === "sessions") {
      for (const session of event.sessions) {
        const previous = lastStatus.get(session.id);
        lastStatus.set(session.id, session.status);
        const finished = isTurnFinished(previous, session.status);
        if (finished) {
          notifyTurnFinished(notifyDeps, {
            title: session.title,
            body: "Finished",
          });
        }
      }
    }
    broadcast("relay:event", event);
  });

  ipcMain.handle("relay:getState", (): RelayState => {
    const sessions = manager.list();
    const transcripts: Record<string, ReturnType<typeof manager.transcript>> = {};
    for (const session of sessions) {
      transcripts[session.id] = manager.transcript(session.id);
    }
    return {
      sessions,
      agents: manager.agents(),
      recents: manager.recents(),
      repos: manager.repos().map(withGitBranch),
      transcripts,
      diffComments: manager.diffCommentsBySession(),
      permissions: manager.pendingPermissions(),
      homeDir: homedir(),
      autoApprove: manager.autoApproveSessions(),
      agentDefaults: manager.agentDefaults(),
      settings: manager.settings(),
      about: { version: app.getVersion(), dataPath: dbPath },
      claudeAdapter: (() => {
        const path = findClaudeAdapter(toolsDir);
        return { available: path !== null, path };
      })(),
    };
  });

  ipcMain.handle(
    "relay:permission",
    (_e, requestId: string, optionId: string | null) => {
      manager.answerPermission(requestId, optionId);
    },
  );

  ipcMain.handle(
    "relay:setAutoApprove",
    (_e, id: string, enabled: boolean) => {
      manager.setAutoApprove(id, enabled);
    },
  );

  ipcMain.handle("relay:create", async (_e, payload: CreatePayload) => {
    const agent = manager.agents().find((a) => a.id === payload.agentId);
    if (!agent) throw new Error(`unknown agent ${payload.agentId}`);
    logger.info("create session", { agent: agent.id, cwd: payload.cwd });
    return manager.create({
      agent,
      cwd: payload.cwd || homedir(),
      prompt: payload.prompt,
      attachments: payload.attachments,
    });
  });

  ipcMain.handle(
    "relay:send",
    async (_e, id: string, text: string, attachments?: PromptAttachment[]) => {
      logger.info("prompt", { sessionId: id });
      await manager.send(id, text, attachments);
    },
  );

  ipcMain.handle("relay:cancel", async (_e, id: string) => {
    logger.info("cancel", { sessionId: id });
    await manager.cancel(id);
  });

  ipcMain.handle(
    "relay:truncate",
    async (_e, id: string, fromEventId: string) => {
      logger.info("truncate", { sessionId: id });
      return manager.truncate(id, fromEventId);
    },
  );

  ipcMain.handle("relay:setMode", async (_e, id: string, modeId: string) => {
    logger.info("set mode", { sessionId: id, modeId });
    await manager.setMode(id, modeId);
  });

  ipcMain.handle(
    "relay:addDiffComment",
    (_e, sessionId: string, input: DiffCommentInput) =>
      manager.addDiffComment(sessionId, input),
  );

  ipcMain.handle("relay:deleteDiffComment", (_e, id: string) => {
    manager.deleteDiffComment(id);
  });

  ipcMain.handle(
    "relay:markDiffCommentsSent",
    (_e, sessionId: string, ids: string[]) => {
      manager.markDiffCommentsSent(sessionId, ids);
    },
  );

  ipcMain.handle("relay:restart", async (_e, id: string) => {
    logger.info("restart", { sessionId: id });
    await manager.restart(id);
  });

  ipcMain.handle("relay:delete", async (_e, id: string) => {
    logger.info("delete", { sessionId: id });
    await manager.delete(id);
  });

  ipcMain.handle("relay:pickDirectory", async (event) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("relay:listFiles", (_e, cwd: string, query?: string) => {
    if (!cwd) return [];
    return listFiles(cwd, { query: typeof query === "string" ? query : "" });
  });

  ipcMain.handle("relay:listSkills", (_e, cwd?: string) => {
    return listSkills({ cwd: typeof cwd === "string" && cwd ? cwd : undefined });
  });

  ipcMain.handle("relay:branchInfo", (_e, cwd: string) => {
    if (typeof cwd !== "string" || !cwd) return null;
    return branchInfo(cwd);
  });

  ipcMain.handle("relay:pickImages", async (event) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
        },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths
      .map(readAttachment)
      .filter((a): a is PromptAttachment => a !== null)
      .slice(0, 8);
  });

  ipcMain.handle("relay:addRepo", async (event) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    if (!win) return manager.repos().map(withGitBranch);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
    });
    const path = result.canceled ? null : (result.filePaths[0] ?? null);
    if (path) {
      manager.addRepo({
        path,
        name: repoNameFromPath(path),
        addedAt: Date.now(),
      });
    }
    return manager.repos().map(withGitBranch);
  });

  ipcMain.handle("relay:removeRepo", async (_e, path: string) => {
    await manager.removeRepo(path);
    return manager.repos().map(withGitBranch);
  });

  ipcMain.handle("relay:saveAgent", (_e, agent: AgentConfig) =>
    manager.saveAgent(agent),
  );

  ipcMain.handle("relay:deleteAgent", (_e, id: string) => {
    manager.removeAgent(id);
  });

  ipcMain.handle("relay:installClaudeAdapter", async () => {
    logger.info("install claude adapter", { prefix: toolsDir });
    const result = await installAndEnableClaudeAdapter({
      prefix: toolsDir,
      agents: manager.agents(),
      onOutput: (line) => broadcast("relay:claudeInstallProgress", line),
    });
    if (!result.ok) return result;
    manager.saveAgents(result.agents);
    return { ok: true as const, binaryPath: result.binaryPath };
  });

  ipcMain.handle("relay:setSetting", (_e, key: string, value: string) => {
    manager.setSetting(key, value);
    if (key === "theme") {
      const source = normalizeStoredTheme(value);
      nativeTheme.themeSource = source;
      const background = resolveBackground(source);
      for (const win of windows) {
        if (!win.isDestroyed()) win.setBackgroundColor(background);
      }
    }
  });

  ipcMain.handle("relay:setPinned", (_e, id: string, pinned: boolean) => {
    manager.setPinned(id, pinned);
  });

  ipcMain.handle("relay:setArchived", (_e, id: string, archived: boolean) => {
    manager.setArchived(id, archived);
  });

  ipcMain.handle("relay:rename", (_e, id: string, title: string) => {
    const trimmed = title.trim();
    if (trimmed) manager.setTitle(id, trimmed);
  });

  ipcMain.handle("relay:copyDebug", (_e, id: string) => {
    const session = manager.get(id);
    const live = session
      ? {
          id: session.id,
          agent: session.agentName,
          cwd: session.workingDirectory,
          status: session.status,
          acpSessionId: session.acpSessionId,
          error: session.error,
        }
      : { error: "missing session" };
    clipboard.writeText(JSON.stringify(live, null, 2));
  });

  ipcMain.handle("relay:openPath", async (_e, cwd: string, path: string) => {
    const resolved = resolveWithinReal(cwd, path);
    if (!resolved) return false;
    const error = await shell.openPath(resolved);
    return error === "";
  });

  ipcMain.handle("relay:windowControl", (event, action: "min" | "max" | "close") => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    if (!win) return;
    if (action === "min") win.minimize();
    else if (action === "max") {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else win.close();
  });

  const themeSource = normalizeStoredTheme(store.getSetting("theme"));
  nativeTheme.themeSource = themeSource;

  const win = createWindow(resolveBackground(themeSource));
  if (process.platform === "darwin") win.setWindowButtonVisibility(false);
  windows.add(win);

  app.on("before-quit", (e) => {
    if (shuttingDown) return;
    e.preventDefault();
    shuttingDown = true;
    void manager.shutdown().finally(() => app.exit(0));
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
