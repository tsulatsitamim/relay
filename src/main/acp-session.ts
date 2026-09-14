import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type RequestPermissionRequest,
  type SessionNotification,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import { pickAutoAllowOption } from "./permission.ts";

export type AcpSessionOptions = {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  resumeSessionId?: string;
  onUpdate: (update: SessionUpdate) => void;
  onPermission?: (info: {
    title?: string;
    optionId: string;
    toolCallId?: string;
  }) => void;
  onLog?: (line: string) => void;
};

export class AcpSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private loadSession = false;
  private didResume = false;
  private promptInFlight: Promise<{ stopReason: string }> | null = null;

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

  async start(): Promise<{
    acpSessionId: string;
    loadSession: boolean;
    resumed: boolean;
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

    const exitError = new Promise<never>((_, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (!this.connection) {
          reject(
            new Error(
              `agent exited before handshake (code ${code}, signal ${signal})`,
            ),
          );
        }
      });
    });

    const input = Writable.toWeb(child.stdin);
    const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(input, output);

    const client: Client = {
      requestPermission: async (params: RequestPermissionRequest) => {
        const optionId = pickAutoAllowOption(params.options);
        if (!optionId) {
          return { outcome: { outcome: "cancelled" } };
        }
        this.opts.onPermission?.({
          title: params.toolCall.title ?? undefined,
          toolCallId: params.toolCall.toolCallId,
          optionId,
        });
        return { outcome: { outcome: "selected", optionId } };
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
          await connection.loadSession({
            sessionId: this.opts.resumeSessionId,
            cwd: this.opts.cwd,
            mcpServers: [],
          });
          this.sessionId = this.opts.resumeSessionId;
          this.didResume = true;
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
    })();

    await Promise.race([handshake, exitError]);

    if (!this.sessionId) {
      throw new Error("ACP session was not created");
    }

    return {
      acpSessionId: this.sessionId,
      loadSession: this.loadSession,
      resumed: this.didResume,
    };
  }

  async prompt(text: string): Promise<{ stopReason: string }> {
    if (!this.connection || !this.sessionId) {
      throw new Error("session is not started");
    }
    const run = this.connection.prompt({
      sessionId: this.sessionId,
      prompt: [{ type: "text", text }],
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
    const child = this.child;
    this.child = null;
    this.connection = null;
    if (!child || child.killed) return;
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
