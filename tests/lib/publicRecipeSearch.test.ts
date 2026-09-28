import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECIPE_SEARCH_LENGTH, searchPublicRecipes } from "../../src/lib/publicRecipeSearch";

const listPublicRecipes = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/publicStore", () => ({ listPublicRecipes }));

const profiles = [
  { githubId: 1, login: "Ann", owner: "ann", repo: "shared" },
  { githubId: 2, login: "Bob", owner: "bob", repo: "recipes" },
];
const recipe = (slug: string, title: string, tags: string[] = [], ingredients: string[] = []) => ({
  slug, title, tags, ingredients, public: true,
});

describe("public recipe search", () => {
  beforeEach(() => listPublicRecipes.mockReset());

  it("searches title, tags, and ingredients across profiles and identifies owners", async () => {
    listPublicRecipes
      .mockResolvedValueOnce([recipe("pasta", "Tomato pasta", ["Dinner"], ["Basil leaves"])])
      .mockResolvedValueOnce([recipe("soup", "Basil soup", ["Lunch"], ["Tomatoes"])]);

    const result = await searchPublicRecipes(profiles, "  BASIL tomato  ");
    expect(result.matches.map(({ profile, recipe }) => [profile.login, recipe.slug])).toEqual([
      ["Bob", "soup"], ["Ann", "pasta"],
    ]);
    expect(result.failedCount).toBe(0);
    expect(listPublicRecipes).toHaveBeenCalledTimes(2);
  });

  it("excludes private and invalid recipe records", async () => {
    listPublicRecipes.mockResolvedValue([
      { ...recipe("secret", "secret soup"), public: false },
      recipe("../unsafe", "secret soup"),
      recipe("safe", "secret soup"),
    ]);
    const result = await searchPublicRecipes(profiles.slice(0, 1), "secret");
    expect(result.matches.map(({ recipe }) => recipe.slug)).toEqual(["safe"]);
  });

  it("returns available matches and counts failed collections", async () => {
    listPublicRecipes
      .mockResolvedValueOnce([recipe("cake", "Apple cake")])
      .mockRejectedValueOnce(new Error("GitHub unavailable"));
    const result = await searchPublicRecipes(profiles, "apple");
    expect(result.matches).toHaveLength(1);
    expect(result.failedCount).toBe(1);
  });

  it("skips network calls for blank searches and rejects oversized searches", async () => {
    expect(await searchPublicRecipes(profiles, "  ")).toEqual({ matches: [], failedCount: 0 });
    await expect(searchPublicRecipes(profiles, "x".repeat(MAX_RECIPE_SEARCH_LENGTH + 1))).rejects.toThrow("too long");
    expect(listPublicRecipes).not.toHaveBeenCalled();
  });
});
