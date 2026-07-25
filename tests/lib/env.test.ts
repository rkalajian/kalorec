import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/lib/env";

describe("loadConfig", () => {
  it("parses valid env vars", () => {
    const config = loadConfig({
      GITHUB_TOKEN: "tok_123",
      GITHUB_REPO: "rob/recipes",
      GITHUB_BRANCH: "main",
    });
    expect(config).toEqual({
      githubToken: "tok_123",
      owner: "rob",
      repo: "recipes",
      branch: "main",
    });
  });

  it("defaults branch to main when unset", () => {
    const config = loadConfig({ GITHUB_TOKEN: "tok_123", GITHUB_REPO: "rob/recipes" });
    expect(config.branch).toBe("main");
  });

  it("throws when GITHUB_TOKEN is missing", () => {
    expect(() => loadConfig({ GITHUB_REPO: "rob/recipes" })).toThrow(/GITHUB_TOKEN/);
  });

  it("throws when GITHUB_REPO is missing", () => {
    expect(() => loadConfig({ GITHUB_TOKEN: "tok_123" })).toThrow(/GITHUB_REPO/);
  });

  it("throws when GITHUB_REPO is malformed", () => {
    expect(() => loadConfig({ GITHUB_TOKEN: "tok_123", GITHUB_REPO: "not-a-repo" })).toThrow(/owner\/name/);
  });
});
