import type { Nutrition } from "./recipe";

const NUTRITION_KEYS: (keyof Nutrition)[] = [
  "calories",
  "protein",
  "fat",
  "carbohydrates",
  "fiber",
  "sugar",
  "sodium",
];

/** Trims a string field; returns undefined for non-strings or empty results. */
export function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export type RecipeUrlField = "sourceUrl" | "image";

/** Accepts only browser-safe external links; images must match our HTTPS-only policy. */
export function normalizeRecipeUrl(value: unknown, field: RecipeUrlField): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a URL`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 2048) throw new Error(`${field} is too long`);

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      (field === "image" && parsed.protocol !== "https:") ||
      parsed.username || parsed.password) {
    throw new Error(`${field} must be ${field === "image" ? "an HTTPS" : "an HTTP or HTTPS"} URL without credentials`);
  }
  if (parsed.href.length > 2048) throw new Error(`${field} is too long`);
  return parsed.href;
}

/** External GitHub JSON may bypass our write API; omit unsafe links when rendering it. */
export function safeRecipeUrl(value: unknown, field: RecipeUrlField): string | undefined {
  try {
    return normalizeRecipeUrl(value, field);
  } catch {
    return undefined;
  }
}

/** Trims each nutrition field and drops empty ones. Returns undefined if none remain. */
export function normalizeNutrition(value: unknown): Nutrition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const result: Nutrition = {};
  for (const key of NUTRITION_KEYS) {
    const normalized = normalizeText(source[key]);
    if (normalized) result[key] = normalized;
  }
  return Object.values(result).some(Boolean) ? result : undefined;
}

/** Lowercases, trims, drops empty entries, and dedupes tags. */
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const normalized = tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(normalized));
}

/** Coerces list entries to trimmed strings and drops empty ones. */
export function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}
