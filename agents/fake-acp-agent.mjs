#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Readable, Writable } from "node:stream";
import {
  AgentSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from "@agentclientprotocol/sdk";

const storePath = process.env.FAKE_ACP_STORE;

function loadStore() {
  if (!storePath || !existsSync(storePath)) return {};
  try {
    return JSON.parse(readFileSync(storePath, "utf8"));
  } catch {
    return {};
  }
}

function saveStore(data) {
  if (!storePath) return;
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function promptText(prompt) {
  if (!Array.isArray(prompt)) return "";
  return prompt
    .map((block) => (block?.type === "text" ? block.text : ""))
    .join("");
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("cancelled"), { cancelled: true }));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const sessions = new Map();
const store = loadStore();
for (const [id, record] of Object.entries(store)) {
  sessions.set(id, { ...record, abort: null });
}

const stream = ndJsonStream(
  Writable.toWeb(process.stdout),
  Readable.toWeb(process.stdin),
);

new AgentSideConnection((conn) => {
  return {
    async initialize() {
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
        agentInfo: { name: "fake-acp", version: "0.1.0" },
      };
    },

    async newSession() {
      const sessionId = randomUUID();
      sessions.set(sessionId, { messages: [], abort: null });
      persist();
      return { sessionId };
    },

    async loadSession({ sessionId }) {
      const existing = sessions.get(sessionId) ?? store[sessionId];
      if (!existing) {
        throw new Error(`unknown session ${sessionId}`);
      }
      sessions.set(sessionId, { ...existing, abort: null });
      for (const message of existing.messages ?? []) {
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: message },
          },
        });
      }
      return {};
    },

    async prompt(params) {
      const session = sessions.get(params.sessionId);
      if (!session) throw new Error("missing session");
      session.abort?.abort();
      session.abort = new AbortController();
      const signal = session.abort.signal;
      const text = promptText(params.prompt);

      try {
        if (text.includes("SLOW")) {
          await sleep(2000, signal);
        } else {
          await sleep(15, signal);
        }

        const reply = `echo: ${text}`;
        session.messages.push(reply);
        persist();

        await conn.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: reply },
          },
        });

        await conn.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "call_edit",
            title: "Edit README.md",
            kind: "edit",
            status: "pending",
            locations: [{ path: "/tmp/README.md" }],
          },
        });

        const permission = await conn.requestPermission({
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: "call_edit",
            title: "Edit README.md",
            kind: "edit",
            status: "pending",
          },
          options: [
            { optionId: "allow", name: "Allow once", kind: "allow_once" },
            { optionId: "reject", name: "Reject", kind: "reject_once" },
          ],
        });

        if (permission.outcome.outcome === "cancelled") {
          return { stopReason: "cancelled" };
        }

        await conn.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "call_edit",
            status: "completed",
            content: [
              {
                type: "diff",
                path: "/tmp/README.md",
                oldText: "hello\n",
                newText: "hello world\n",
              },
            ],
          },
        });

        return { stopReason: "end_turn" };
      } catch (err) {
        if (err?.cancelled || signal.aborted) {
          return { stopReason: "cancelled" };
        }
        throw err;
      } finally {
        session.abort = null;
      }
    },

    async cancel({ sessionId }) {
      sessions.get(sessionId)?.abort?.abort();
    },
  };
}, stream);

function persist() {
  const data = {};
  for (const [id, session] of sessions) {
    data[id] = { messages: session.messages };
  }
  saveStore(data);
}
