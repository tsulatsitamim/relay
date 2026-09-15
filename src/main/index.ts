import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, clipboard } from "electron";
import { applyLoginPath } from "./path-env.ts";
import { openStore } from "./db.ts";
import { SessionManager, defaultAgents } from "./session-manager.ts";
import { createLogger } from "./logger.ts";
import { repoNameFromPath, withGitBranch } from "./repo-name.ts";
import { listFiles } from "./file-index.ts";
import { readAttachment } from "./attachments.ts";
import type { CreatePayload } from "../shared/ipc.ts";
import type { PromptAttachment } from "../shared/types.ts";

function fakeAgentPath(): string | undefined {
  const candidates = [
    join(app.getAppPath(), "agents", "fake-acp-agent.mjs"),
    join(process.cwd(), "agents", "fake-acp-agent.mjs"),
    fileURLToPath(new URL("../../agents/fake-acp-agent.mjs", import.meta.url)),
  ];
  return candidates.find((path) => existsSync(path));
}

function createWindow(): BrowserWindow {
  const dir = dirname(fileURLToPath(import.meta.url));
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 520,
    title: "Relay",
    backgroundColor: "#F4F4F2",
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
  const logger = createLogger(join(userData, "relay.log"));
  const store = await openStore(join(userData, "relay.db"));
  if (store.listAgents().length === 0) {
    store.saveAgents(defaultAgents(fakeAgentPath()));
  }

  const manager = new SessionManager(store);
  let shuttingDown = false;

  const windows = new Set<BrowserWindow>();

  const broadcast = (channel: string, payload: unknown) => {
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  };

  manager.onEvent((event) => {
    if (event.type === "log") logger.info(event.message, { sessionId: event.sessionId });
    broadcast("relay:event", event);
  });

  ipcMain.handle("relay:getState", () => {
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
      permissions: manager.pendingPermissions(),
      homeDir: homedir(),
    };
  });

  ipcMain.handle(
    "relay:permission",
    (_e, requestId: string, optionId: string | null) => {
      manager.answerPermission(requestId, optionId);
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

  const win = createWindow();
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
