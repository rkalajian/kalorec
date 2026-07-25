import { parse, type HTMLElement } from "node-html-parser";
import type { Recipe } from "../recipe";

type PartialRecipe = Omit<Recipe, "slug" | "createdAt" | "updatedAt">;

function extractTitle(root: HTMLElement): string {
  const h1 = root.querySelector("h1");
  if (h1 && h1.textContent.trim()) return h1.textContent.trim();
  const titleTag = root.querySelector("title");
  return titleTag && titleTag.textContent.trim() ? titleTag.textContent.trim() : "Untitled Recipe";
}

function findListNear(root: HTMLElement, keywords: RegExp): string[] {
  const headings = root.querySelectorAll("h1, h2, h3, h4, strong, b");
  for (const heading of headings) {
    if (!keywords.test(heading.textContent)) continue;
    let sibling = heading.nextElementSibling;
    let hops = 0;
    while (sibling && hops < 4) {
      if (sibling.tagName === "UL" || sibling.tagName === "OL") {
        const items = sibling
          .querySelectorAll("li")
          .map((li) => li.textContent.trim())
          .filter(Boolean);
        if (items.length) return items;
      }
      sibling = sibling.nextElementSibling;
      hops++;
    }
  }
  return [];
}

export function extractFallbackRecipe(html: string): PartialRecipe {
  const root = parse(html);
  return {
    title: extractTitle(root),
    tags: [],
    ingredients: findListNear(root, /ingredients?/i),
    instructions: findListNear(root, /instructions?|directions?|steps?|method/i),
    image: undefined,
    servings: undefined,
    prepTime: undefined,
    cookTime: undefined,
    nutrition: undefined,
    notes: undefined,
    sourceUrl: undefined,
  };
}
