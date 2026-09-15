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
  SessionModeLike,
} from "../shared/types.ts";

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
  onUpdate: (update: SessionUpdate) => void;
  requestPermission?: (prompt: PermissionPrompt) => Promise<PermissionAnswer>;
  onExit?: (info: AcpExitInfo) => void;
  onLog?: (line: string) => void;
};

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
  return state.availableModes.map((mode) => ({
    id: mode.id,
    ...(mode.name ? { name: mode.name } : {}),
    ...(mode.description ? { description: mode.description } : {}),
  }));
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

  async start(): Promise<{
    acpSessionId: string;
    loadSession: boolean;
    resumed: boolean;
    modes?: SessionModeLike[];
    currentModeId?: string;
  }> {
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
          return { outcome: { outcome: "selected", optionId: answer.optionId } };
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
    };
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.sessionId) return;
    await this.connection.setSessionMode({
      sessionId: this.sessionId,
      modeId,
    });
  }

  async prompt(
    text: string,
    attachments: PromptAttachment[] = [],
  ): Promise<{ stopReason: string }> {
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
      return { stopReason: result.stopReason };
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
    if (!child || this.exited || child.killed) return;
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
