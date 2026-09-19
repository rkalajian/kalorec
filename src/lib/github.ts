import type { Recipe } from "./recipe";

const RECIPES_DIR = "data/recipes";
export const SHARED_RECIPES_DIR = "data/shared-recipes";
const CONTENTS_DIRECTORY_LIMIT = 1000;
const LIST_CONCURRENCY = 8;

export interface GithubClient {
  repos: {
    getContent(params: { owner: string; repo: string; path: string; ref?: string }): Promise<any>;
    createOrUpdateFileContents(params: {
      owner: string;
      repo: string;
      path: string;
      message: string;
      content: string;
      sha?: string;
      branch: string;
    }): Promise<any>;
    deleteFile(params: {
      owner: string;
      repo: string;
      path: string;
      message: string;
      sha: string;
      branch: string;
    }): Promise<any>;
  };
}

export interface GithubStoreConfig {
  owner: string;
  repo: string;
  branch?: string;
  directory?: string;
}

export interface StoredRecipe {
  recipe: Recipe;
  sha: string;
}

export class RecipeStore {
  constructor(private client: GithubClient, private config: GithubStoreConfig) {}

  private get directory(): string {
    return this.config.directory ?? RECIPES_DIR;
  }

  private path(slug: string): string {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Invalid recipe slug");
    }
    return `${this.directory}/${slug}.json`;
  }

  async list(): Promise<Recipe[]> {
    const { owner, repo, branch } = this.config;
    let entries: any[];
    try {
      const res = await this.client.repos.getContent({
        owner,
        repo,
        path: this.directory,
        ...(branch ? { ref: branch } : {}),
      });
      if (!Array.isArray(res.data)) {
        throw new Error("GitHub returned an invalid recipe directory listing");
      }
      entries = res.data;
    } catch (err: any) {
      if (err.status === 404) return [];
      throw err;
    }
    if (entries.length >= CONTENTS_DIRECTORY_LIMIT) {
      throw new Error(
        `Recipe directory listing reached GitHub Contents API's 1,000-entry limit; reduce files in ${this.directory}`
      );
    }

    const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
    const recipes: Recipe[] = [];
    for (let index = 0; index < files.length; index += LIST_CONCURRENCY) {
      const batch = files.slice(index, index + LIST_CONCURRENCY);
      const stored = await Promise.all(batch.map((file) => this.get(file.name.replace(/\.json$/, ""))));
      const missingIndex = stored.findIndex((item) => item === null);
      if (missingIndex !== -1) {
        throw new Error(`Recipe file disappeared while listing: ${batch[missingIndex].name}`);
      }
      recipes.push(...stored.flatMap((item) => (item ? [item.recipe] : [])));
    }
    return recipes;
  }

  async get(slug: string): Promise<StoredRecipe | null> {
    const { owner, repo, branch } = this.config;
    try {
      const res = await this.client.repos.getContent({
        owner,
        repo,
        path: this.path(slug),
        ...(branch ? { ref: branch } : {}),
      });
      if (Array.isArray(res.data) || res.data.type !== "file") return null;
      const content = Buffer.from(res.data.content, "base64").toString("utf-8");
      return { recipe: JSON.parse(content) as Recipe, sha: res.data.sha };
    } catch (err: any) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async create(recipe: Recipe): Promise<void> {
    const { owner, repo, branch } = this.config;
    await this.client.repos.createOrUpdateFileContents({
      owner,
      repo,
      branch: branch!,
      path: this.path(recipe.slug),
      message: `Add recipe: ${recipe.title}`,
      content: Buffer.from(JSON.stringify(recipe, null, 2)).toString("base64"),
      sha: undefined,
    });
  }

  async update(recipe: Recipe, sha: string): Promise<void> {
    const { owner, repo, branch } = this.config;
    await this.client.repos.createOrUpdateFileContents({
      owner,
      repo,
      branch: branch!,
      path: this.path(recipe.slug),
      message: `Update recipe: ${recipe.title}`,
      content: Buffer.from(JSON.stringify(recipe, null, 2)).toString("base64"),
      sha,
    });
  }

  async remove(slug: string, sha: string, title: string): Promise<void> {
    const { owner, repo, branch } = this.config;
    await this.client.repos.deleteFile({
      owner,
      repo,
      branch: branch!,
      path: this.path(slug),
      message: `Delete recipe: ${title}`,
      sha,
    });
  }
}
