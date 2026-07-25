// tests/lib/extract/index.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { extractRecipeFromUrl } from "../../../src/lib/extract";

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonLdHtml = `<html><head><script type="application/ld+json">
{"@type":"Recipe","name":"Soup","recipeIngredient":["water"],"recipeInstructions":["Boil it."]}
</script></head><body></body></html>`;

const plainHtml = `<html><head><title>Blog</title></head><body><h1>Blog</h1></body></html>`;

describe("extractRecipeFromUrl", () => {
  it("returns a recipe with no warning when JSON-LD is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(jsonLdHtml, { status: 200 })));
    const result = await extractRecipeFromUrl("https://example.com/soup");
    expect(result.recipe.title).toBe("Soup");
    expect(result.recipe.sourceUrl).toBe("https://example.com/soup");
    expect(result.warning).toBeUndefined();
  });

  it("falls back with a warning when no JSON-LD is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(plainHtml, { status: 200 })));
    const result = await extractRecipeFromUrl("https://example.com/blog");
    expect(result.recipe.title).toBe("Blog");
    expect(result.warning).toMatch(/heuristically/);
  });

  it("throws when the response is not OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(extractRecipeFromUrl("https://example.com/missing")).rejects.toThrow(/404/);
  });

  it("throws when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(extractRecipeFromUrl("https://example.com/down")).rejects.toThrow(/network down/);
  });
});
