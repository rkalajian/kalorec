import { describe, it, expect } from "vitest";
import { normalizeText, normalizeNutrition, normalizeTags, normalizeStringList } from "../../src/lib/normalize";

describe("normalizeText", () => {
  it("trims a string field", () => {
    expect(normalizeText("  4 servings  ")).toBe("4 servings");
  });

  it("returns undefined for an empty string", () => {
    expect(normalizeText("")).toBeUndefined();
    expect(normalizeText("   ")).toBeUndefined();
  });

  it("returns undefined for non-string values", () => {
    expect(normalizeText(undefined)).toBeUndefined();
    expect(normalizeText(null)).toBeUndefined();
    expect(normalizeText(42)).toBeUndefined();
  });
});

describe("normalizeNutrition", () => {
  it("trims each field and drops empty ones", () => {
    expect(
      normalizeNutrition({ calories: " 200 ", protein: "", fat: "10g", sugar: "   " })
    ).toEqual({ calories: "200", fat: "10g" });
  });

  it("returns undefined when every field is empty", () => {
    expect(
      normalizeNutrition({
        calories: "",
        protein: "",
        fat: "",
        carbohydrates: "",
        fiber: "",
        sugar: "",
        sodium: "",
      })
    ).toBeUndefined();
  });

  it("returns undefined for a non-object value", () => {
    expect(normalizeNutrition(undefined)).toBeUndefined();
    expect(normalizeNutrition(null)).toBeUndefined();
  });
});

describe("normalizeTags", () => {
  it("lowercases, trims, and dedupes", () => {
    expect(normalizeTags(["dinner", "Dinner", " DINNER ", "quick"])).toEqual(["dinner", "quick"]);
  });

  it("drops empty entries", () => {
    expect(normalizeTags(["", "  ", "soup"])).toEqual(["soup"]);
  });

  it("returns an empty array for a non-array value", () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe("normalizeStringList", () => {
  it("coerces non-string entries to trimmed strings", () => {
    expect(normalizeStringList([1, "  2 cups flour  ", true])).toEqual(["1", "2 cups flour", "true"]);
  });

  it("filters out empty entries after trimming", () => {
    expect(normalizeStringList(["step one", "  ", ""])).toEqual(["step one"]);
  });

  it("returns an empty array for a non-array value", () => {
    expect(normalizeStringList(undefined)).toEqual([]);
  });
});
