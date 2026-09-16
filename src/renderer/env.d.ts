import type { CreatePayload, RelayEvent, RelayState } from "../shared/ipc.ts";
import type { PromptAttachment, Repo, Session } from "../shared/types.ts";

export type RelayBridge = {
  getState: () => Promise<RelayState>;
  create: (payload: CreatePayload) => Promise<Session>;
  send: (id: string, text: string, attachments?: PromptAttachment[]) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  setMode: (sessionId: string, modeId: string) => Promise<void>;
  permission: (requestId: string, optionId: string | null) => Promise<void>;
  restart: (id: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  pickDirectory: () => Promise<string | null>;
  listFiles: (cwd: string, query?: string) => Promise<string[]>;
  listSkills: (cwd?: string) => Promise<string[]>;
  pickImages: () => Promise<PromptAttachment[]>;
  addRepo: () => Promise<Repo[]>;
  removeRepo: (path: string) => Promise<Repo[]>;
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  copyDebug: (id: string) => Promise<void>;
  windowControl: (action: "min" | "max" | "close") => Promise<void>;
  subscribe: (listener: (event: RelayEvent) => void) => () => void;
};

declare global {
  interface Window {
    relay: RelayBridge;
  }
}

export {};
