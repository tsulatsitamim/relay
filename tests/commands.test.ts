import { describe, expect, it } from "vitest";
import {
  commandsForAgent,
  lastCommands,
  mergeCommands,
} from "../src/renderer/commands.ts";
import type {
  AvailableCommandLike,
  Session,
  TranscriptEvent,
} from "../src/shared/types.ts";

let counter = 0;

function session(id: string, agentConfigId: string, updatedAt = 1): Session {
  return {
    id,
    title: id,
    agentConfigId,
    agentName: agentConfigId,
    workingDirectory: "/tmp",
    status: "idle",
    createdAt: 1,
    updatedAt,
  };
}

function commandsEvent(commands: AvailableCommandLike[]): TranscriptEvent {
  counter += 1;
  return { id: `event-${counter}`, kind: "commands", payload: { commands } };
}

function userEvent(): TranscriptEvent {
  counter += 1;
  return { id: `event-${counter}`, kind: "user", payload: { text: "hi" } };
}

describe("lastCommands", () => {
  it("returns the most recent commands list", () => {
    const events = [
      commandsEvent([{ name: "init", description: "setup" }]),
      userEvent(),
      commandsEvent([{ name: "review", description: "review changes" }]),
    ];
    expect(lastCommands(events)).toEqual([
      { name: "review", description: "review changes" },
    ]);
  });

  it("returns an empty list when there is no commands event", () => {
    expect(lastCommands([userEvent()])).toEqual([]);
  });

  it("returns an empty list for an undefined transcript", () => {
    expect(lastCommands(undefined)).toEqual([]);
  });

  it("returns an empty list when the payload is malformed", () => {
    const event: TranscriptEvent = {
      id: "bad",
      kind: "commands",
      payload: { commands: "nope" },
    };
    expect(lastCommands([event])).toEqual([]);
  });
});

describe("commandsForAgent", () => {
  it("uses the first matching session that has commands", () => {
    const sessions = [
      session("recent", "opencode", 10),
      session("older", "opencode", 5),
      session("other-agent", "claude"),
    ];
    const transcripts = {
      recent: [userEvent()],
      older: [commandsEvent([{ name: "init", description: "setup" }])],
      "other-agent": [commandsEvent([{ name: "wrong", description: "" }])],
    };
    expect(commandsForAgent(sessions, transcripts, "opencode")).toEqual([
      { name: "init", description: "setup" },
    ]);
  });

  it("returns an empty list when no session of that agent has commands", () => {
    const sessions = [session("a", "opencode")];
    expect(commandsForAgent(sessions, { a: [userEvent()] }, "opencode")).toEqual(
      [],
    );
  });
});

describe("mergeCommands", () => {
  it("appends skill names missing from the agent list", () => {
    const acp = [{ name: "init", description: "setup" }];
    expect(mergeCommands(acp, ["brainstorming", "init"])).toEqual([
      { name: "init", description: "setup" },
      { name: "brainstorming", description: "" },
    ]);
  });

  it("dedupes skill names and ignores names already in the agent list", () => {
    expect(mergeCommands([], ["a", "a", "b"])).toEqual([
      { name: "a", description: "" },
      { name: "b", description: "" },
    ]);
  });

  it("returns the agent list unchanged when there are no skills", () => {
    const acp = [{ name: "init", description: "setup" }];
    expect(mergeCommands(acp, [])).toBe(acp);
  });
});
