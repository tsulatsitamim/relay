import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  private?: boolean;
  description?: string;
  author?: string;
  license?: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readRepoFile(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function packageJson(): PackageJson {
  return JSON.parse(readRepoFile("package.json")) as PackageJson;
}

function builderConfig(): string {
  return readRepoFile("electron-builder.yml");
}

describe("package.json packaging metadata", () => {
  it("stays private with attribution, an unlicensed marker and a description", () => {
    const pkg = packageJson();
    expect(pkg.private).toBe(true);
    expect(pkg.author).toBe("Relay");
    expect(pkg.license).toBe("UNLICENSED");
    expect(typeof pkg.description).toBe("string");
    expect(pkg.description!.length).toBeGreaterThan(0);
  });

  it("exposes dist and dist:dir scripts", () => {
    const pkg = packageJson();
    expect(pkg.scripts.dist).toBe(
      "electron-vite build && electron-builder --publish never",
    );
    expect(pkg.scripts["dist:dir"]).toBe(
      "electron-vite build && electron-builder --dir",
    );
  });

  it("keeps electron-builder as a devDependency only", () => {
    const pkg = packageJson();
    expect(pkg.devDependencies?.["electron-builder"]).toBeTruthy();
    expect(pkg.dependencies ?? {}).not.toHaveProperty("electron-builder");
  });
});

describe("electron-builder configuration", () => {
  it("declares the app identity and build directories", () => {
    const config = builderConfig();
    expect(config).toMatch(/appId:\s*app\.relay\.desktop/);
    expect(config).toMatch(/productName:\s*Relay/);
    expect(config).toMatch(/buildResources:\s*build/);
    expect(config).toMatch(/output:\s*dist/);
  });

  it("packages out, package.json and production node_modules", () => {
    const config = builderConfig();
    expect(config).toContain("out/**/*");
    expect(config).toContain("package.json");
    expect(config).toContain("node_modules/**/*");
  });

  it("unpacks the native modules and rebuilds them for Electron", () => {
    const config = builderConfig();
    expect(config).toMatch(/asarUnpack:[\s\S]*?sql\.js/);
    expect(config).toMatch(/asarUnpack:[\s\S]*?node-pty/);
    expect(config).toMatch(/npmRebuild:\s*true/);
  });

  it("keeps the terminal runtime dependencies and the rebuild tool", () => {
    const pkg = packageJson();
    expect(pkg.dependencies?.["node-pty"]).toBeTruthy();
    expect(pkg.dependencies?.["@xterm/xterm"]).toBeTruthy();
    expect(pkg.dependencies?.["@xterm/addon-fit"]).toBeTruthy();
    expect(pkg.dependencies ?? {}).not.toHaveProperty("@electron/rebuild");
    expect(pkg.devDependencies?.["@electron/rebuild"]).toBeTruthy();
    expect(pkg.scripts.postinstall).toBe("electron-rebuild -f -w node-pty");
  });

  it("targets an unsigned macOS dmg and zip", () => {
    const config = builderConfig();
    expect(config).toMatch(/category:\s*public\.app-category\.developer-tools/);
    expect(config).toMatch(/identity:\s*null/);
    expect(config).toContain("dmg");
    expect(config).toContain("zip");
    expect(config).not.toMatch(/^\s*(win|linux):/m);
  });
});
