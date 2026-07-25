import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractJsonLdRecipe } from "../../../src/lib/extract/jsonld";

const fixture = (name: string) => readFileSync(join(__dirname, "../../fixtures", name), "utf-8");

describe("extractJsonLdRecipe", () => {
  it("parses a schema.org Recipe from JSON-LD", () => {
    const result = extractJsonLdRecipe(fixture("jsonld-recipe.html"));
    expect(result).toEqual({
      title: "Grandma's Chili",
      image: "https://example.com/chili.jpg",
      tags: [],
      servings: "6 servings",
      prepTime: "PT15M",
      cookTime: "PT2H",
      ingredients: ["1 lb ground beef", "2 cans kidney beans"],
      instructions: ["Brown the beef.", "Add remaining ingredients and simmer."],
      nutrition: { calories: "320 kcal", protein: "18g", carbohydrates: "35g" },
      notes: undefined,
      sourceUrl: undefined,
    });
  });

  it("returns null when no Recipe JSON-LD is present", () => {
    expect(extractJsonLdRecipe(fixture("no-recipe.html"))).toBeNull();
  });
});
