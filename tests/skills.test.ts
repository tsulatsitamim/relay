import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listSkills } from "../src/main/skills.ts";

const dirs: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-skills-"));
  dirs.push(dir);
  return dir;
}

function skillDir(root: string, ...parts: string[]): void {
  const dir = join(root, ...parts);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "# skill");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("listSkills", () => {
  it("collects skill names from the global roots", () => {
    const home = tempRoot();
    skillDir(home, ".claude", "skills", "brainstorming");
    skillDir(home, ".agents", "skills", "grilling");
    skillDir(home, ".config", "opencode", "skills", "writing-plans");
    skillDir(home, ".config", "opencode", "skill", "mintlify");

    expect(listSkills({ home })).toEqual([
      "brainstorming",
      "grilling",
      "mintlify",
      "writing-plans",
    ]);
  });

  it("includes project roots when a cwd is given", () => {
    const home = tempRoot();
    const cwd = tempRoot();
    skillDir(cwd, ".claude", "skills", "project-claude");
    skillDir(cwd, ".agents", "skills", "project-agents");
    skillDir(cwd, ".opencode", "skills", "project-config");
    skillDir(cwd, ".opencode", "skill", "project-config-singular");

    expect(listSkills({ home, cwd })).toEqual([
      "project-agents",
      "project-claude",
      "project-config",
      "project-config-singular",
    ]);
  });

  it("finds skills nested below a root", () => {
    const home = tempRoot();
    skillDir(home, ".claude", "skills", "group", "alpha");

    expect(listSkills({ home })).toEqual(["alpha"]);
  });

  it("ignores directories without a SKILL.md and missing roots", () => {
    const home = tempRoot();
    mkdirSync(join(home, ".claude", "skills", "empty"), { recursive: true });
    writeFileSync(join(home, ".claude", "skills", "stray.md"), "# not a skill");

    expect(listSkills({ home })).toEqual([]);
  });

  it("dedupes a name found in more than one root", () => {
    const home = tempRoot();
    const cwd = tempRoot();
    skillDir(home, ".claude", "skills", "shared");
    skillDir(cwd, ".agents", "skills", "shared");

    expect(listSkills({ home, cwd })).toEqual(["shared"]);
  });

  it("caches the result per home and cwd", () => {
    const home = tempRoot();
    expect(listSkills({ home })).toEqual([]);

    skillDir(home, ".claude", "skills", "late");

    expect(listSkills({ home })).toEqual([]);
    expect(listSkills({ home, cwd: tempRoot() })).toEqual(["late"]);
  });
});
