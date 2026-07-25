import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractFallbackRecipe } from "../../../src/lib/extract/fallback";

const fixture = (name: string) => readFileSync(join(__dirname, "../../fixtures", name), "utf-8");

describe("extractFallbackRecipe", () => {
  it("finds title, ingredients, and instructions near matching headings", () => {
    const result = extractFallbackRecipe(fixture("heuristic-recipe.html"));
    expect(result.title).toBe("Weeknight Pasta");
    expect(result.ingredients).toEqual(["1 lb spaghetti", "2 cloves garlic", "1/4 cup olive oil"]);
    expect(result.instructions).toEqual(["Boil the pasta.", "Saute garlic in olive oil.", "Toss together and serve."]);
    expect(result.tags).toEqual([]);
  });

  it("returns empty arrays instead of throwing when nothing matches", () => {
    const result = extractFallbackRecipe("<html><head><title>Empty</title></head><body></body></html>");
    expect(result.title).toBe("Empty");
    expect(result.ingredients).toEqual([]);
    expect(result.instructions).toEqual([]);
  });
});
