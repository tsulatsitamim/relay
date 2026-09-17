// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HomeComposer } from "../src/renderer/HomeComposer";
import type { AgentConfig, Repo } from "../src/shared/types";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});

const agents: AgentConfig[] = [{ id: "fake", name: "Fake" }];
const repos: Repo[] = [{ path: "/tmp/repo", name: "repo", branch: "main" }];

function setup(
  recents: string[] = [],
  overrides: Partial<React.ComponentProps<typeof HomeComposer>> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <HomeComposer
      agents={agents}
      repos={repos}
      recents={recents}
      agentId="fake"
      repoPath="/tmp/repo"
      busy={false}
      error={null}
      onAgentId={vi.fn()}
      onRepoPath={vi.fn()}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, field: screen.getByRole("textbox") as HTMLTextAreaElement };
}

describe("HomeComposer", () => {
  it("does not render the decorative home chrome", () => {
    setup();
    expect(document.querySelector(".pills")).toBeNull();
    expect(document.querySelector(".hint")).toBeNull();
    expect(screen.queryByText("This Mac")).toBeNull();
  });

  it("leaves the agent select empty and disables sending without an agent", () => {
    const { field } = setup([], { agentId: "" });
    const select = document.querySelector(
      ".composer-bar select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "Pilih agent" })).toBeTruthy();

    fireEvent.change(field, { target: { value: "hello" } });
    const orb = screen.getByLabelText("Voice") as HTMLButtonElement;
    expect(orb.disabled).toBe(true);
  });

  it("enables sending once an agent is selected", () => {
    const { field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    const orb = screen.getByLabelText("Send") as HTMLButtonElement;
    expect(orb.disabled).toBe(false);
  });

  it("submits on Enter", () => {
    const { onSubmit, field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  it("inserts a newline on Shift+Enter", () => {
    const { onSubmit, field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers recent folders that are not already in the sidebar", () => {
    setup(["/tmp/old", "/tmp/repo"]);
    expect(screen.getAllByRole("option", { name: "/tmp/old" })).toHaveLength(1);
    expect(screen.queryAllByRole("option", { name: "/tmp/repo" })).toHaveLength(0);
  });

  it("inserts a picked command into the input and sends it", () => {
    const { onSubmit, field } = setup([], {
      commands: [{ name: "init", description: "guided setup" }],
    });
    fireEvent.change(field, { target: { value: "/ini" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field.value).toBe("/init ");

    fireEvent.change(field, { target: { value: `${field.value}hello` } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("/init hello");
  });

  it("offers files for an @ token and inserts one", async () => {
    const listFiles = vi.fn().mockResolvedValue(["src/index.ts", "README.md"]);
    // @ts-expect-error test shim
    window.relay = { listFiles };
    const { field } = setup();
    fireEvent.change(field, { target: { value: "look at @ind" } });
    const option = await screen.findByText("src/index.ts");
    fireEvent.click(option);
    expect(field.value).toBe("look at @src/index.ts ");
    expect(listFiles).toHaveBeenCalledWith("/tmp/repo", "ind");
  });

  it("does not look up files without a repository", async () => {
    const listFiles = vi.fn().mockResolvedValue(["src/index.ts"]);
    // @ts-expect-error test shim
    window.relay = { listFiles };
    const { field } = setup([], { repoPath: "" });
    fireEvent.change(field, { target: { value: "@ind" } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(listFiles).not.toHaveBeenCalled();
    expect(screen.queryByText("src/index.ts")).toBeNull();
  });

  it("attaches a picked image and sends it with the prompt", async () => {
    const pickImages = vi.fn().mockResolvedValue([
      { name: "shot.png", mimeType: "image/png", data: "AAAA" },
    ]);
    // @ts-expect-error test shim
    window.relay = { pickImages };
    const { onSubmit, field } = setup();
    fireEvent.click(screen.getByLabelText("Attach image"));
    expect(await screen.findByText("shot.png")).toBeTruthy();

    fireEvent.change(field, { target: { value: "look" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("look", [
        { name: "shot.png", mimeType: "image/png", data: "AAAA" },
      ]),
    );
  });
});
