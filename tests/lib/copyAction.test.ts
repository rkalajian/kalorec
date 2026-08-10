import { describe, it, expect } from "vitest";
import { resolveCopyAction } from "../../src/lib/copyAction";

describe("resolveCopyAction", () => {
  it("returns login when there is no session", () => {
    expect(resolveCopyAction(null)).toEqual({ type: "login" });
  });

  it("returns settings when logged in without a configured repo", () => {
    expect(resolveCopyAction({ githubLogin: "rob", accessToken: "tok", repo: null })).toEqual({
      type: "settings",
    });
  });

  it("returns copy with the owner/repo when a repo is configured", () => {
    expect(
      resolveCopyAction({
        githubLogin: "rob",
        accessToken: "tok",
        repo: { owner: "rob", name: "recipes", branch: "main", private: false },
      })
    ).toEqual({ type: "copy", owner: "rob", repo: "recipes" });
  });
});
