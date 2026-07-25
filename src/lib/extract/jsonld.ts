import { parse } from "node-html-parser";
import type { Recipe } from "../recipe";

type PartialRecipe = Omit<Recipe, "slug" | "createdAt" | "updatedAt">;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function findRecipeNode(json: any): any | null {
  const nodes: any[] = [];
  const collect = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    nodes.push(node);
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(collect);
  };
  collect(json);
  return (
    nodes.find((n) =>
      asArray(n["@type"]).some((t) => typeof t === "string" && t.toLowerCase() === "recipe")
    ) ?? null
  );
}

function textOf(value: any): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.text === "string") return value.text.trim();
  return "";
}

function extractInstructions(raw: any): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  const steps: string[] = [];
  for (const item of asArray(raw)) {
    if (typeof item === "string") {
      steps.push(item.trim());
    } else if (item && item["@type"] === "HowToSection" && Array.isArray(item.itemListElement)) {
      steps.push(...extractInstructions(item.itemListElement));
    } else {
      const text = textOf(item);
      if (text) steps.push(text);
    }
  }
  return steps.filter(Boolean);
}

function extractImage(raw: any): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return extractImage(raw[0]);
  if (typeof raw === "object" && typeof raw.url === "string") return raw.url;
  return undefined;
}

function extractNutrition(raw: any): Recipe["nutrition"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const nutrition: Recipe["nutrition"] = {
    calories: raw.calories?.trim?.() || undefined,
    protein: raw.proteinContent?.trim?.() || undefined,
    fat: raw.fatContent?.trim?.() || undefined,
    carbohydrates: raw.carbohydrateContent?.trim?.() || undefined,
    fiber: raw.fiberContent?.trim?.() || undefined,
    sugar: raw.sugarContent?.trim?.() || undefined,
    sodium: raw.sodiumContent?.trim?.() || undefined,
  };
  return Object.values(nutrition).some(Boolean) ? nutrition : undefined;
}

export function extractJsonLdRecipe(html: string): PartialRecipe | null {
  const root = parse(html);
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let json: any;
    try {
      json = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const node = findRecipeNode(json);
    if (!node) continue;
    const title = typeof node.name === "string" ? node.name.trim() : "";
    if (!title) continue;
    return {
      title,
      image: extractImage(node.image),
      tags: [],
      servings: asArray(node.recipeYield).map(String).join(", ") || undefined,
      prepTime: typeof node.prepTime === "string" ? node.prepTime : undefined,
      cookTime: typeof node.cookTime === "string" ? node.cookTime : undefined,
      ingredients: asArray(node.recipeIngredient).map((i: any) => String(i).trim()).filter(Boolean),
      instructions: extractInstructions(node.recipeInstructions),
      nutrition: extractNutrition(node.nutrition),
      notes: undefined,
      sourceUrl: undefined,
    };
  }
  return null;
}
