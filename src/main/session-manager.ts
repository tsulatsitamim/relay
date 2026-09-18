import { randomUUID } from "node:crypto";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type {
  AgentConfig,
  DiffComment,
  PermissionRequest,
  PromptAttachment,
  Repo,
  Session,
  SessionStatus,
  TranscriptEvent,
} from "../shared/types.ts";
import {
  AcpSession,
  configOptionsFrom,
  isAuthRequired,
  type AcpExitInfo,
  type PermissionAnswer,
  type PermissionPrompt,
  type PromptUsage,
} from "./acp-session.ts";
import type { Store } from "./db.ts";
import { hasBinaryOnPath, resolveClaudeAgent } from "./agents.ts";
import { pickAutoAllowOption } from "./permission.ts";
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
  private readonly autoApprove = new Set<string>();
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

  agentDefaults(): Record<string, string> {
    const defaults: Record<string, string> = {};
    for (const { cwd, agentId } of this.store.listAgentDefaults()) {
      defaults[cwd] = agentId;
    }
    return defaults;
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
    this.emitSessions();
  }

  saveAgent(agent: AgentConfig): AgentConfig {
    const agents = this.store.listAgents();
    const index = agents.findIndex((item) => item.id === agent.id && agent.id !== "");
    const saved =
      index === -1
        ? { ...agent, id: uniqueAgentId(agent.name, agents) }
        : { ...agent };
    const next =
      index === -1
        ? [...agents, saved]
        : agents.map((item, i) => (i === index ? saved : item));
    this.store.saveAgents(next);
    return saved;
  }

  removeAgent(id: string): void {
    const agents = this.store.listAgents();
    const remaining = agents.filter((agent) => agent.id !== id);
    if (remaining.length === agents.length) {
      throw new Error(`unknown agent ${id}`);
    }
    if (remaining.length === 0) {
      throw new Error("cannot delete the last provider");
    }
    this.store.saveAgents(remaining);
  }

  settings(): Record<string, string> {
    return this.store.listSettings();
  }

  setSetting(key: string, value: string): void {
    this.store.setSetting(key, value);
  }

  transcript(sessionId: string): TranscriptEvent[] {
    return this.events.get(sessionId) ?? [];
  }

  addDiffComment(
    sessionId: string,
    input: {
      eventId: string;
      path: string;
      startLine: number;
      endLine: number;
      body: string;
    },
  ): DiffComment {
    this.require(sessionId);
    const body = input.body.trim();
    if (!body) throw new Error("diff comment body is required");
    const comment: DiffComment = {
      id: randomUUID(),
      sessionId,
      eventId: input.eventId,
      path: input.path,
      startLine: input.startLine,
      endLine: input.endLine,
      body,
      createdAt: Date.now(),
    };
    this.store.addDiffComment(comment);
    return comment;
  }

  diffComments(sessionId: string): DiffComment[] {
    return this.store.listDiffComments(sessionId);
  }

  diffCommentsBySession(): Record<string, DiffComment[]> {
    const grouped: Record<string, DiffComment[]> = {};
    for (const session of this.list()) {
      const comments = this.store.listDiffComments(session.id);
      if (comments.length > 0) grouped[session.id] = comments;
    }
    return grouped;
  }

  deleteDiffComment(id: string): void {
    this.store.deleteDiffComment(id);
  }

  markDiffCommentsSent(sessionId: string, ids: string[]): void {
    this.store.markDiffCommentsSent(ids, Date.now());
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

  setAutoApprove(id: string, enabled: boolean): void {
    if (enabled) this.autoApprove.add(id);
    else this.autoApprove.delete(id);
  }

  autoApproveSessions(): string[] {
    return [...this.autoApprove];
  }

  private askPermission(
    sessionId: string,
    prompt: PermissionPrompt,
  ): Promise<PermissionAnswer> {
    if (this.autoApprove.has(sessionId)) {
      const optionId = pickAutoAllowOption(prompt.options);
      return Promise.resolve(
        optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" },
      );
    }
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
    this.store.setAgentDefault(session.workingDirectory, input.agent.id);
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

    void this.startTurn(session, input.agent, input.prompt, input.attachments);
    return this.require(session.id);
  }

  private async startTurn(
    session: Session,
    agent: AgentConfig,
    prompt: string,
    attachments: PromptAttachment[] = [],
  ): Promise<void> {
    try {
      await this.attach(session, agent, false);
      await this.runPrompt(session.id, prompt, attachments);
    } catch (err) {
      if (this.get(session.id)?.status !== "error") this.fail(session.id, err);
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

  async truncate(id: string, fromEventId: string): Promise<TranscriptEvent[]> {
    this.require(id);
    const current = this.events.get(id) ?? [];
    const index = current.findIndex((event) => event.id === fromEventId);
    if (index === -1) throw new Error(`unknown transcript event ${fromEventId}`);
    const target = current[index]!;
    const seq =
      target.seq ??
      this.store.listEvents(id).find((event) => event.id === fromEventId)?.seq;
    if (seq == null) throw new Error(`unknown transcript event ${fromEventId}`);
    const trimmed = current.slice(0, index);
    this.events.set(id, trimmed);
    this.store.deleteEventsFrom(id, seq);
    this.emit({ type: "transcript", sessionId: id, events: trimmed });
    return trimmed;
  }

  async cancel(id: string): Promise<void> {
    this.patch(id, { status: "cancelling" });
    await this.live.get(id)?.cancel();
  }

  async setMode(id: string, modeId: string): Promise<void> {
    const session = this.require(id);
    if (!this.live.has(id)) {
      const agent = this.agentFor(session);
      await this.attach(session, agent, true);
    }
    await this.live.get(id)?.setMode(modeId);
  }

  async setConfigOption(
    id: string,
    configId: string,
    value: string,
  ): Promise<void> {
    const session = this.require(id);
    if (!this.live.has(id)) {
      const agent = this.agentFor(session);
      await this.attach(session, agent, true);
    }
    const options = await this.live.get(id)?.setConfigOption(configId, value);
    if (options) this.patch(id, { configOptions: options }, false);
  }

  async restart(id: string): Promise<void> {
    const session = this.require(id);
    await this.live.get(id)?.kill();
    this.live.delete(id);
    this.autoApprove.delete(id);
    const agent = this.agentFor(session);
    await this.attach(session, agent, Boolean(session.acpSessionId));
  }

  async authenticate(id: string, methodId: string): Promise<void> {
    const session = this.require(id);
    const agent = this.agentFor(session);
    await this.live.get(id)?.kill();
    this.live.delete(id);
    await this.attach(session, agent, Boolean(session.acpSessionId), methodId);
  }

  async delete(id: string): Promise<void> {
    await this.live.get(id)?.kill();
    this.live.delete(id);
    this.cancelPendingForSession(id);
    this.autoApprove.delete(id);
    this.events.delete(id);
    this.store.deleteSession(id);
    this.emitSessions();
  }

  async detachAll(): Promise<void> {
    await Promise.all(
      [...this.live.values()].map((session) => session.kill()),
    );
    this.live.clear();
    this.autoApprove.clear();
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
    authMethodId?: string,
  ): Promise<void> {
    this.patch(session.id, { status: "starting", error: undefined });
    if (resume) this.loading.add(session.id);
    const acp = new AcpSession({
      command: agent.command,
      args: agent.args,
      cwd: session.workingDirectory,
      env: agent.env,
      resumeSessionId: resume ? session.acpSessionId : undefined,
      authMethodId,
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
    } catch (err) {
      if (isAuthRequired(err)) {
        this.patch(session.id, {
          authRequired: true,
          authMethods: acp.authMethods,
        });
      }
      throw err;
    } finally {
      this.loading.delete(session.id);
    }
    this.live.set(session.id, acp);
    const modePatch: Partial<Session> =
      started.modes && started.modes.length > 0
        ? { modes: started.modes, currentModeId: started.currentModeId }
        : {};
    const configPatch: Partial<Session> =
      started.configOptions && started.configOptions.length > 0
        ? { configOptions: started.configOptions }
        : {};
    this.patch(session.id, {
      acpSessionId: started.acpSessionId,
      status: "idle",
      authRequired: false,
      error: started.resumed || !resume ? undefined : undefined,
      ...modePatch,
      ...configPatch,
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
      if (result.usage) this.recordUsage(id, result.usage);
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
    if (update.sessionUpdate === "current_mode_update") {
      this.patch(sessionId, { currentModeId: update.currentModeId }, false);
      return;
    }
    if (update.sessionUpdate === "config_option_update") {
      const configOptions = configOptionsFrom(
        (update as { configOptions?: unknown }).configOptions,
      );
      if (configOptions.length > 0) {
        this.patch(sessionId, { configOptions }, false);
      }
      return;
    }
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

  private recordUsage(id: string, usage: PromptUsage): void {
    const payload: Record<string, unknown> = {};
    if (Number.isFinite(usage.inputTokens)) payload.inputTokens = usage.inputTokens;
    if (Number.isFinite(usage.outputTokens)) payload.outputTokens = usage.outputTokens;
    if (Number.isFinite(usage.totalTokens)) payload.totalTokens = usage.totalTokens;
    if (Number.isFinite(usage.cachedReadTokens)) {
      payload.cachedReadTokens = usage.cachedReadTokens;
    }
    if (Object.keys(payload).length === 0) return;
    const current = this.events.get(id) ?? [];
    const last = current[current.length - 1];
    if (last?.kind === "usage") {
      const event: TranscriptEvent = {
        ...last,
        payload: { ...last.payload, ...payload },
      };
      const next = [...current.slice(0, -1), event];
      this.events.set(id, next);
      this.store.appendEvent(this.withMeta(id, event));
      this.emit({ type: "transcript", sessionId: id, events: next });
      return;
    }
    this.append(id, { kind: "usage", payload });
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
    if (!this.get(id)) return;
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
): { name: string; mimeType: string; thumb?: string }[] {
  return attachments.map((a) => ({
    name: a.name,
    mimeType: a.mimeType,
    ...(a.thumb ? { thumb: a.thumb } : {}),
  }));
}

function uniqueAgentId(name: string, existing: AgentConfig[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider";
  let id = `${base}-${randomUUID().slice(0, 8)}`;
  while (existing.some((agent) => agent.id === id)) {
    id = `${base}-${randomUUID().slice(0, 8)}`;
  }
  return id;
}

export function defaultAgents(fakeAgentPath?: string): AgentConfig[] {
  const claude = resolveClaudeAgent(hasBinaryOnPath);
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
      command: claude.command,
      args: claude.args,
      enabled: false,
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
