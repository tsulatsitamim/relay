import { randomUUID } from "node:crypto";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type {
  AgentConfig,
  PermissionRequest,
  PromptAttachment,
  Repo,
  Session,
  SessionStatus,
  TranscriptEvent,
} from "../shared/types.ts";
import {
  AcpSession,
  type AcpExitInfo,
  type PermissionAnswer,
  type PermissionPrompt,
} from "./acp-session.ts";
import type { Store } from "./db.ts";
import { reduceSessionUpdate } from "./transcript.ts";
import { titleFromPrompt } from "./title.ts";
import { repoFor } from "../shared/repo.ts";

const PERMISSION_TIMEOUT_MS = 120_000;

export type CreateSessionInput = {
  agent: AgentConfig;
  cwd: string;
  prompt: string;
  attachments?: PromptAttachment[];
};

export type ManagerEvent =
  | { type: "sessions"; sessions: Session[] }
  | { type: "transcript"; sessionId: string; events: TranscriptEvent[] }
  | { type: "permission"; sessionId: string; request: PermissionRequest }
  | { type: "permission_resolved"; sessionId: string; requestId: string }
  | { type: "log"; sessionId?: string; message: string };

export class SessionManager {
  private readonly live = new Map<string, AcpSession>();
  private readonly events = new Map<string, TranscriptEvent[]>();
  private readonly listeners = new Set<(event: ManagerEvent) => void>();
  private readonly loading = new Set<string>();
  private readonly permissions = new Map<
    string,
    { request: PermissionRequest; resolve: (answer: PermissionAnswer) => void }
  >();
  private seq = 0;

  constructor(private readonly store: Store) {
    for (const session of store.listSessions()) {
      this.events.set(session.id, store.listEvents(session.id));
    }
  }

  onEvent(listener: (event: ManagerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): Session[] {
    return this.store.listSessions();
  }

  get(id: string): Session | undefined {
    return this.list().find((s) => s.id === id);
  }

  agents(): AgentConfig[] {
    return this.store.listAgents();
  }

  recents(): string[] {
    return this.store.listRecents();
  }

  repos(): Repo[] {
    return this.store.listRepos();
  }

  addRepo(repo: Repo): void {
    this.store.addRepo(repo);
  }

  async removeRepo(path: string): Promise<void> {
    const repos = this.store.listRepos();
    const sessions = this.list().filter(
      (session) => repoFor(session.workingDirectory, repos)?.path === path,
    );
    for (const session of sessions) {
      await this.delete(session.id);
    }
    this.store.removeRepo(path);
    this.emitSessions();
  }

  setPinned(id: string, pinned: boolean): Session {
    return this.patch(id, { pinned }, false);
  }

  setArchived(id: string, archived: boolean): Session {
    return this.patch(id, archived ? { archived: true, pinned: false } : { archived: false }, false);
  }

  setTitle(id: string, title: string): Session {
    return this.patch(id, { title }, false);
  }

  saveAgents(agents: AgentConfig[]): void {
    this.store.saveAgents(agents);
  }

  transcript(sessionId: string): TranscriptEvent[] {
    return this.events.get(sessionId) ?? [];
  }

  pendingPermissions(): PermissionRequest[] {
    return [...this.permissions.values()].map((p) => p.request);
  }

  answerPermission(requestId: string, optionId: string | null): void {
    this.settlePermission(
      requestId,
      optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" },
    );
  }

  private askPermission(
    sessionId: string,
    prompt: PermissionPrompt,
  ): Promise<PermissionAnswer> {
    const id = randomUUID();
    const request: PermissionRequest = {
      id,
      sessionId,
      toolCallId: prompt.toolCallId,
      title: prompt.title,
      kind: prompt.kind,
      options: prompt.options,
    };
    return new Promise<PermissionAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.emit({
          type: "log",
          sessionId,
          message: `permission request timed out for ${request.title ?? id}`,
        });
        this.settlePermission(id, { outcome: "cancelled" });
      }, PERMISSION_TIMEOUT_MS);
      this.permissions.set(id, {
        request,
        resolve: (answer) => {
          clearTimeout(timer);
          resolve(answer);
        },
      });
      this.emit({ type: "permission", sessionId, request });
    });
  }

  private settlePermission(requestId: string, answer: PermissionAnswer): void {
    const pending = this.permissions.get(requestId);
    if (!pending) return;
    this.permissions.delete(requestId);
    pending.resolve(answer);
    this.emit({
      type: "permission_resolved",
      sessionId: pending.request.sessionId,
      requestId,
    });
  }

  private cancelPendingForSession(sessionId: string): void {
    for (const [id, pending] of [...this.permissions]) {
      if (pending.request.sessionId === sessionId) {
        this.settlePermission(id, { outcome: "cancelled" });
      }
    }
  }

  private handleExit(sessionId: string, info: AcpExitInfo): void {
    this.live.delete(sessionId);
    this.cancelPendingForSession(sessionId);
    const session = this.get(sessionId);
    if (!session || session.status === "exited") return;
    this.patch(sessionId, { status: "exited" });
    this.append(sessionId, {
      kind: "status",
      payload: {
        text: `Agent process exited (code ${info.code}, signal ${info.signal}).`,
      },
    });
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      title: titleFromPrompt(input.prompt),
      agentConfigId: input.agent.id,
      agentName: input.agent.name,
      workingDirectory: input.cwd,
      status: "starting",
      createdAt: now,
      updatedAt: now,
    };
    const known = this.store.listAgents();
    if (!known.some((a) => a.id === input.agent.id)) {
      this.store.saveAgents([...known, input.agent]);
    }
    this.store.saveSession(session);
    this.store.touchRecent(input.cwd);
    this.events.set(session.id, []);
    this.append(session.id, {
      kind: "user",
      payload: {
        text: input.prompt,
        ...(input.attachments?.length
          ? { attachments: attachmentMeta(input.attachments) }
          : {}),
      },
    });
    this.emitSessions();

    try {
      await this.attach(session, input.agent, false);
      await this.runPrompt(session.id, input.prompt, input.attachments);
      return this.require(session.id);
    } catch (err) {
      this.fail(session.id, err);
      throw err;
    }
  }

  async send(
    id: string,
    text: string,
    attachments: PromptAttachment[] = [],
  ): Promise<void> {
    const session = this.require(id);
    this.append(id, {
      kind: "user",
      payload: {
        text,
        ...(attachments.length ? { attachments: attachmentMeta(attachments) } : {}),
      },
    });
    if (!this.live.has(id)) {
      const agent = this.agentFor(session);
      await this.attach(session, agent, true);
    }
    await this.runPrompt(id, text, attachments);
  }

  async cancel(id: string): Promise<void> {
    this.patch(id, { status: "cancelling" });
    await this.live.get(id)?.cancel();
  }

  async restart(id: string): Promise<void> {
    const session = this.require(id);
    await this.live.get(id)?.kill();
    this.live.delete(id);
    const agent = this.agentFor(session);
    await this.attach(session, agent, Boolean(session.acpSessionId));
  }

  async delete(id: string): Promise<void> {
    await this.live.get(id)?.kill();
    this.live.delete(id);
    this.cancelPendingForSession(id);
    this.events.delete(id);
    this.store.deleteSession(id);
    this.emitSessions();
  }

  async detachAll(): Promise<void> {
    await Promise.all(
      [...this.live.values()].map((session) => session.kill()),
    );
    this.live.clear();
    for (const id of [...this.permissions.keys()]) {
      this.settlePermission(id, { outcome: "cancelled" });
    }
    for (const session of this.list()) {
      if (session.status !== "error") {
        this.patch(session.id, { status: "exited" });
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.detachAll();
  }

  private async attach(
    session: Session,
    agent: AgentConfig,
    resume: boolean,
  ): Promise<void> {
    this.patch(session.id, { status: "starting", error: undefined });
    if (resume) this.loading.add(session.id);
    const acp = new AcpSession({
      command: agent.command,
      args: agent.args,
      cwd: session.workingDirectory,
      env: agent.env,
      resumeSessionId: resume ? session.acpSessionId : undefined,
      onUpdate: (update) => this.handleUpdate(session.id, update),
      requestPermission: (prompt) => this.askPermission(session.id, prompt),
      onExit: (info) => this.handleExit(session.id, info),
      onLog: (line) => {
        this.emit({ type: "log", sessionId: session.id, message: line.trim() });
      },
    });
    let started;
    try {
      started = await acp.start();
    } finally {
      this.loading.delete(session.id);
    }
    this.live.set(session.id, acp);
    this.patch(session.id, {
      acpSessionId: started.acpSessionId,
      status: "idle",
      error: started.resumed || !resume ? undefined : undefined,
    });
    if (resume && !started.resumed) {
      this.append(session.id, {
        kind: "status",
        payload: {
          text: "Agent could not resume its own memory. Started a new ACP session.",
        },
      });
    }
  }

  private async runPrompt(
    id: string,
    text: string,
    attachments: PromptAttachment[] = [],
  ): Promise<void> {
    const acp = this.live.get(id);
    if (!acp) throw new Error("session process is not running");
    this.patch(id, { status: "working", lastPromptAt: Date.now() });
    try {
      const result = await acp.prompt(text, attachments);
      this.patch(id, { status: "idle" });
      if (result.stopReason === "cancelled") {
        this.append(id, {
          kind: "status",
          payload: { text: "Cancelled" },
        });
      }
    } catch (err) {
      this.fail(id, err);
      throw err;
    }
  }

  private handleUpdate(sessionId: string, update: SessionUpdate): void {
    if (this.loading.has(sessionId)) return;
    const current = this.events.get(sessionId) ?? [];
    const reduced = reduceSessionUpdate(
      current,
      update as { sessionUpdate: string; [key: string]: unknown },
      () => randomUUID(),
    );
    const added = reduced.slice(current.length);
    const replaced = reduced.slice(0, current.length);
    this.events.set(sessionId, reduced);
    for (let i = 0; i < replaced.length; i++) {
      if (replaced[i] !== current[i]) {
        this.store.appendEvent(this.withMeta(sessionId, replaced[i]));
      }
    }
    for (const event of added) {
      this.store.appendEvent(this.withMeta(sessionId, event));
    }
    this.emit({ type: "transcript", sessionId, events: reduced });
  }

  private append(
    sessionId: string,
    partial: Pick<TranscriptEvent, "kind" | "payload">,
  ): void {
    const event = this.withMeta(sessionId, {
      id: randomUUID(),
      kind: partial.kind,
      payload: partial.payload,
      createdAt: Date.now(),
    });
    const list = this.events.get(sessionId) ?? [];
    list.push(event);
    this.events.set(sessionId, list);
    this.store.appendEvent(event);
    this.emit({ type: "transcript", sessionId, events: list });
  }

  private withMeta(sessionId: string, event: TranscriptEvent): TranscriptEvent {
    return {
      ...event,
      sessionId,
      seq: event.seq ?? this.store.nextSeq(sessionId),
      createdAt: event.createdAt ?? Date.now(),
    };
  }

  private patch(id: string, patch: Partial<Session>, touch = true): Session {
    const session = this.require(id);
    const next = {
      ...session,
      ...patch,
      updatedAt: touch ? Date.now() : session.updatedAt,
    };
    this.store.saveSession(next);
    this.emitSessions();
    return next;
  }

  private fail(id: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.patch(id, { status: "error", error: message });
    this.append(id, { kind: "error", payload: { text: message } });
  }

  private require(id: string): Session {
    const session = this.get(id);
    if (!session) throw new Error(`unknown session ${id}`);
    return session;
  }

  private agentFor(session: Session): AgentConfig {
    const agent = this.store.listAgents().find((a) => a.id === session.agentConfigId);
    if (agent) return agent;
    throw new Error(`missing agent config ${session.agentConfigId}`);
  }

  private emitSessions(): void {
    this.emit({ type: "sessions", sessions: this.list() });
  }

  private emit(event: ManagerEvent): void {
    this.seq += 1;
    for (const listener of this.listeners) listener(event);
  }
}

function attachmentMeta(
  attachments: PromptAttachment[],
): { name: string; mimeType: string }[] {
  return attachments.map((a) => ({ name: a.name, mimeType: a.mimeType }));
}

export function defaultAgents(fakeAgentPath?: string): AgentConfig[] {
  const agents: AgentConfig[] = [
    {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      args: ["acp"],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      command: "npx",
      args: ["-y", "@zed-industries/claude-code-acp"],
    },
  ];
  if (fakeAgentPath) {
    agents.unshift({
      id: "fake",
      name: "Fake ACP",
      command: process.execPath,
      args: [fakeAgentPath],
    });
  }
  return agents;
}

export type { SessionStatus };
