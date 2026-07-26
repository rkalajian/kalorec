import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const storeSourcePath = fileURLToPath(new URL("../../src/lib/store.ts", import.meta.url));

describe("store.ts source shape", () => {
  // Regression guard for the production-build bug: Astro's vite-plugin-env only
  // injects the individual env keys referenced as `import.meta.env.KEY` in a
  // file's own source text. A bare `import.meta.env` reference (no trailing
  // `.KEY`) causes Astro to strip GITHUB_TOKEN/GITHUB_REPO/GITHUB_BRANCH out of
  // the production build entirely, even though it works fine in `astro dev`.
  it("never references bare import.meta.env — only per-key import.meta.env.KEY", () => {
    const source = readFileSync(storeSourcePath, "utf-8");
    const bareUsage = /import\.meta\.env(?!\s*\.\s*\w)/g;
    expect(source.match(bareUsage)).toBeNull();
  });

  it("explicitly references each required env key by literal name", () => {
    const source = readFileSync(storeSourcePath, "utf-8");
    expect(source).toContain("import.meta.env.GITHUB_TOKEN");
    expect(source).toContain("import.meta.env.GITHUB_REPO");
    expect(source).toContain("import.meta.env.GITHUB_BRANCH");
  });
});

describe("getStore", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("builds a store from GITHUB_TOKEN/GITHUB_REPO/GITHUB_BRANCH", async () => {
    vi.stubEnv("GITHUB_TOKEN", "tok_123");
    vi.stubEnv("GITHUB_REPO", "rob/recipes");
    vi.stubEnv("GITHUB_BRANCH", "dev");
    const { getStore } = await import("../../src/lib/store");
    expect(getStore()).toBeDefined();
  });

  it("throws when GITHUB_TOKEN is missing", async () => {
    vi.stubEnv("GITHUB_REPO", "rob/recipes");
    const { getStore } = await import("../../src/lib/store");
    expect(() => getStore()).toThrow(/GITHUB_TOKEN/);
  });

  it("throws when GITHUB_REPO is missing", async () => {
    vi.stubEnv("GITHUB_TOKEN", "tok_123");
    const { getStore } = await import("../../src/lib/store");
    expect(() => getStore()).toThrow(/GITHUB_REPO/);
  });
});
