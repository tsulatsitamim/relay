import { describe, expect, it } from "vitest";
import {
  commandsForAgent,
  lastCommands,
  leadingCommands,
  mergeCommands,
  promptTurns,
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

const NAMES = ["init", "review", "brainstorming"];

describe("leadingCommands", () => {
  it("collects the leading command tokens and their end offset", () => {
    expect(leadingCommands("/init /review hello world", NAMES)).toEqual({
      commands: ["init", "review"],
      end: "/init /review".length,
    });
  });

  it("stops at the first token that is not a command", () => {
    expect(leadingCommands("/init hello /review", NAMES)).toEqual({
      commands: ["init"],
      end: "/init".length,
    });
  });

  it("ignores unknown slash tokens", () => {
    expect(leadingCommands("/nope hello", NAMES)).toEqual({ commands: [], end: 0 });
  });

  it("returns nothing when the first token is not a command", () => {
    expect(leadingCommands("hello /init", NAMES)).toEqual({ commands: [], end: 0 });
    expect(leadingCommands("", NAMES)).toEqual({ commands: [], end: 0 });
  });

  it("skips leading whitespace", () => {
    expect(leadingCommands("  /init hello", NAMES)).toEqual({
      commands: ["init"],
      end: "  /init".length,
    });
  });
});

describe("promptTurns", () => {
  it("returns a single turn for plain text", () => {
    expect(promptTurns("hello", NAMES)).toEqual(["hello"]);
  });

  it("attaches the text to the last command", () => {
    expect(promptTurns("/init /review hello", NAMES)).toEqual([
      "/init",
      "/review hello",
    ]);
  });

  it("sends a lone command on its own", () => {
    expect(promptTurns("/init", NAMES)).toEqual(["/init"]);
  });

  it("keeps unknown commands literal", () => {
    expect(promptTurns("/nope hello", NAMES)).toEqual(["/nope hello"]);
  });

  it("keeps tokens after the leading commands literal", () => {
    expect(promptTurns("/init /nope hello", NAMES)).toEqual(["/init /nope hello"]);
  });

  it("normalizes whitespace", () => {
    expect(promptTurns("  /init   /review   hello  ", NAMES)).toEqual([
      "/init",
      "/review hello",
    ]);
  });

  it("returns no turns for blank input", () => {
    expect(promptTurns("   ", NAMES)).toEqual([]);
  });
});

describe("promptTurns with skills", () => {
  const SKILL_NAMES = [...NAMES, "grill-me"];
  const SKILLS = ["brainstorming", "grill-me"];

  it("batches consecutive skills into one turn", () => {
    expect(
      promptTurns("/brainstorming /grill-me plan A", SKILL_NAMES, SKILLS),
    ).toEqual(["/brainstorming /grill-me plan A"]);
  });

  it("starts a new turn for a skill after a plain command", () => {
    expect(promptTurns("/init /brainstorming foo", SKILL_NAMES, SKILLS)).toEqual([
      "/init",
      "/brainstorming foo",
    ]);
  });

  it("keeps a lone skill as one turn", () => {
    expect(promptTurns("/brainstorming", SKILL_NAMES, SKILLS)).toEqual([
      "/brainstorming",
    ]);
  });

  it("still splits plain commands", () => {
    expect(promptTurns("/init /review hello", SKILL_NAMES, SKILLS)).toEqual([
      "/init",
      "/review hello",
    ]);
  });
});
