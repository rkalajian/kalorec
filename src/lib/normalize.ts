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
