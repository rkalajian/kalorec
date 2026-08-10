export interface Nutrition {
  calories?: string;
  protein?: string;
  fat?: string;
  carbohydrates?: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
}

export interface Recipe {
  slug: string;
  title: string;
  sourceUrl?: string;
  image?: string;
  tags: string[];
  public?: boolean;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  ingredients: string[];
  instructions: string[];
  nutrition?: Nutrition;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "recipe";
}

export function dedupeSlug(base: string, existingSlugs: string[]): string {
  const taken = new Set(existingSlugs);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
