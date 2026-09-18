import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type ContentBlock,
  type RequestPermissionRequest,
  type SessionModeState,
  type SessionNotification,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import type {
  PermissionOptionLike,
  PromptAttachment,
  SessionAuthMethod,
  SessionConfigOption,
  SessionConfigValue,
  SessionModeLike,
} from "../shared/types.ts";

export type PromptUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedReadTokens?: number;
};

export type PermissionPrompt = {
  toolCallId?: string;
  title?: string;
  kind?: string;
  options: PermissionOptionLike[];
};

export type PermissionAnswer =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

export type AcpExitInfo = {
  code: number | null;
  signal: string | null;
};

export type AcpSessionOptions = {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  resumeSessionId?: string;
  authMethodId?: string;
  onUpdate: (update: SessionUpdate) => void;
  requestPermission?: (prompt: PermissionPrompt) => Promise<PermissionAnswer>;
  onExit?: (info: AcpExitInfo) => void;
  onLog?: (line: string) => void;
};

export function authMethodsFrom(raw: unknown): SessionAuthMethod[] {
  if (!Array.isArray(raw)) return [];
  const methods: SessionAuthMethod[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.name !== "string") continue;
    const method: SessionAuthMethod = { id: record.id, name: record.name };
    if (typeof record.description === "string") {
      method.description = record.description;
    }
    methods.push(method);
  }
  return methods;
}

export function isAuthRequired(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === -32000
  );
}

export function promptBlocks(
  text: string,
  attachments: PromptAttachment[] = [],
): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: "text", text }];
  for (const attachment of attachments) {
    blocks.push({
      type: "image",
      mimeType: attachment.mimeType,
      data: attachment.data,
      uri: null,
    });
  }
  return blocks;
}

function sessionModes(state: SessionModeState): SessionModeLike[] {
  const available = Array.isArray(state.availableModes) ? state.availableModes : [];
  return available.map((mode) => ({
    id: mode.id,
    ...(mode.name ? { name: mode.name } : {}),
    ...(mode.description ? { description: mode.description } : {}),
  }));
}

function configValuesFrom(raw: unknown): SessionConfigValue[] {
  if (!Array.isArray(raw)) return [];
  const values: SessionConfigValue[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.value !== "string") continue;
    const value: SessionConfigValue = {
      value: record.value,
      name: typeof record.name === "string" ? record.name : record.value,
    };
    if (typeof record.description === "string") {
      value.description = record.description;
    }
    values.push(value);
  }
  return values;
}

export function configOptionsFrom(raw: unknown): SessionConfigOption[] {
  if (!Array.isArray(raw)) return [];
  const options: SessionConfigOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!id) continue;
    if (typeof record.currentValue !== "string") continue;
    const option: SessionConfigOption = {
      id,
      name:
        typeof record.name === "string" && record.name ? record.name : id,
      type: typeof record.type === "string" ? record.type : "select",
      currentValue: record.currentValue,
      values: configValuesFrom(record.values ?? record.options),
    };
    if (typeof record.description === "string") {
      option.description = record.description;
    }
    options.push(option);
  }
  return options;
}

function promptUsage(raw: unknown): PromptUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const usage: PromptUsage = {};
  if (Number.isFinite(record.inputTokens)) {
    usage.inputTokens = record.inputTokens as number;
  }
  if (Number.isFinite(record.outputTokens)) {
    usage.outputTokens = record.outputTokens as number;
  }
  if (Number.isFinite(record.totalTokens)) {
    usage.totalTokens = record.totalTokens as number;
  }
  if (Number.isFinite(record.cachedReadTokens)) {
    usage.cachedReadTokens = record.cachedReadTokens as number;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

export class AcpSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private loadSession = false;
  private didResume = false;
  private promptInFlight: Promise<{ stopReason: string }> | null = null;
  private stopping = false;
  private exited = false;
  private modeState: SessionModeState | null = null;
  private configState: SessionConfigOption[] | null = null;
  private authState: SessionAuthMethod[] = [];
  private authRequiredFlag = false;

  constructor(private readonly opts: AcpSessionOptions) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  get acpSessionId(): string | undefined {
    return this.sessionId ?? undefined;
  }

  get supportsLoad(): boolean {
    return this.loadSession;
  }

  get resumed(): boolean {
    return this.didResume;
  }

  get modes(): SessionModeLike[] | undefined {
    return this.modeState ? sessionModes(this.modeState) : undefined;
  }

  get currentModeId(): string | undefined {
    return this.modeState?.currentModeId ?? undefined;
  }

  get configOptions(): SessionConfigOption[] | undefined {
    return this.configState ?? undefined;
  }

  get authMethods(): SessionAuthMethod[] {
    return this.authState;
  }

  get authRequired(): boolean {
    return this.authRequiredFlag;
  }

  async start(): Promise<{
    acpSessionId: string;
    loadSession: boolean;
    resumed: boolean;
    modes?: SessionModeLike[];
    currentModeId?: string;
    configOptions?: SessionConfigOption[];
  }> {
    try {
      const child = spawn(this.opts.command, this.opts.args, {
        cwd: this.opts.cwd,
        env: { ...process.env, ...this.opts.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;

      child.stderr.on("data", (chunk: Buffer) => {
        this.opts.onLog?.(chunk.toString());
      });

      let handshakeDone = false;
      const exitError = new Promise<never>((_, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          this.exited = true;
          if (!handshakeDone) {
            reject(
              new Error(
                `agent exited before handshake (code ${code}, signal ${signal})`,
              ),
            );
          } else if (!this.stopping) {
            this.opts.onExit?.({ code, signal });
          }
        });
      });

      const input = Writable.toWeb(child.stdin);
      const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
      const stream = ndJsonStream(input, output);

      const client: Client = {
        requestPermission: async (params: RequestPermissionRequest) => {
          const answer: PermissionAnswer = this.opts.requestPermission
            ? await this.opts.requestPermission({
                toolCallId: params.toolCall.toolCallId,
                title: params.toolCall.title ?? undefined,
                kind: params.toolCall.kind ?? undefined,
                options: params.options.map((option) => ({
                  optionId: option.optionId,
                  name: option.name,
                  kind: option.kind,
                })),
              })
            : { outcome: "cancelled" };
          if (answer.outcome === "selected") {
            return {
              outcome: { outcome: "selected", optionId: answer.optionId },
            };
          }
          return { outcome: { outcome: "cancelled" } };
        },
        sessionUpdate: async (params: SessionNotification) => {
          this.opts.onUpdate(params.update);
        },
      };

      const connection = new ClientSideConnection(() => client, stream);
      this.connection = connection;

      const handshake = (async () => {
        const init = await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {},
          clientInfo: { name: "relay", version: "0.1.0" },
        });
        this.loadSession = Boolean(init.agentCapabilities?.loadSession);
        this.authState = authMethodsFrom(init.authMethods);

        if (this.opts.authMethodId) {
          await connection.authenticate({ methodId: this.opts.authMethodId });
        }

        if (this.opts.resumeSessionId && this.loadSession) {
          try {
            const loaded = await connection.loadSession({
              sessionId: this.opts.resumeSessionId,
              cwd: this.opts.cwd,
              mcpServers: [],
            });
            this.sessionId = this.opts.resumeSessionId;
            this.didResume = true;
            this.modeState = loaded.modes ?? null;
            this.configState = configOptionsFrom(loaded.configOptions);
            return;
          } catch (err) {
            this.opts.onLog?.(
              `session/load failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        const created = await connection.newSession({
          cwd: this.opts.cwd,
          mcpServers: [],
        });
        this.sessionId = created.sessionId;
        this.didResume = false;
        this.modeState = created.modes ?? null;
        this.configState = configOptionsFrom(created.configOptions);
      })();

      await Promise.race([handshake, exitError]);
      handshakeDone = true;

      if (!this.sessionId) {
        throw new Error("ACP session was not created");
      }

      return {
        acpSessionId: this.sessionId,
        loadSession: this.loadSession,
        resumed: this.didResume,
        modes: this.modes,
        currentModeId: this.currentModeId,
        configOptions: this.configOptions,
      };
    } catch (err) {
      if (isAuthRequired(err)) this.authRequiredFlag = true;
      await this.kill();
      throw err;
    }
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.sessionId) return;
    await this.connection.setSessionMode({
      sessionId: this.sessionId,
      modeId,
    });
  }

  async setConfigOption(
    configId: string,
    value: string,
  ): Promise<SessionConfigOption[]> {
    if (!this.connection || !this.sessionId) {
      throw new Error("session is not started");
    }
    const result = await this.connection.setSessionConfigOption({
      sessionId: this.sessionId,
      configId,
      value,
    });
    this.configState = configOptionsFrom(result.configOptions);
    return this.configState;
  }

  async prompt(
    text: string,
    attachments: PromptAttachment[] = [],
  ): Promise<{ stopReason: string; usage?: PromptUsage }> {
    if (!this.connection || !this.sessionId) {
      throw new Error("session is not started");
    }
    const run = this.connection.prompt({
      sessionId: this.sessionId,
      prompt: promptBlocks(text, attachments),
    });
    this.promptInFlight = run;
    try {
      const result = await run;
      return { stopReason: result.stopReason, usage: promptUsage(result.usage) };
    } catch (err) {
      if (isAuthRequired(err)) this.authRequiredFlag = true;
      throw err;
    } finally {
      this.promptInFlight = null;
    }
  }

  async cancel(): Promise<void> {
    if (!this.connection || !this.sessionId) return;
    await this.connection.cancel({ sessionId: this.sessionId });
  }

  async kill(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    this.connection = null;
    if (!child || this.exited || child.killed || child.pid === undefined) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
}
