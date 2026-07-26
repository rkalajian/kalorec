import { describe, it, expect } from "vitest";
import { getStore } from "../../src/lib/store";
import { RecipeStore } from "../../src/lib/github";

describe("getStore", () => {
  it("builds a RecipeStore scoped to the session's chosen repo", () => {
    const store = getStore({
      accessToken: "tok_123",
      repo: { owner: "rob", name: "recipes", branch: "dev" },
    });
    expect(store).toBeInstanceOf(RecipeStore);
  });
});
