import { describe, it, expect } from "vitest";
import { slugify, dedupeSlug } from "../../src/lib/recipe";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Grandma's Chili")).toBe("grandma-s-chili");
  });

  it("collapses punctuation and whitespace", () => {
    expect(slugify("  Spicy!!  Thai   Soup  ")).toBe("spicy-thai-soup");
  });

  it("falls back to 'recipe' for empty input", () => {
    expect(slugify("   ")).toBe("recipe");
  });
});

describe("dedupeSlug", () => {
  it("returns the base slug when unused", () => {
    expect(dedupeSlug("chili", [])).toBe("chili");
  });

  it("appends -2 on first collision", () => {
    expect(dedupeSlug("chili", ["chili"])).toBe("chili-2");
  });

  it("finds the next free suffix", () => {
    expect(dedupeSlug("chili", ["chili", "chili-2", "chili-3"])).toBe("chili-4");
  });
});
