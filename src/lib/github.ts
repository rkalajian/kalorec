import type { Recipe } from "./recipe";

const RECIPES_DIR = "data/recipes";

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
  branch: string;
}

export interface StoredRecipe {
  recipe: Recipe;
  sha: string;
}

export class RecipeStore {
  constructor(private client: GithubClient, private config: GithubStoreConfig) {}

  private path(slug: string): string {
    return `${RECIPES_DIR}/${slug}.json`;
  }

  async list(): Promise<Recipe[]> {
    const { owner, repo, branch } = this.config;
    let entries: any[];
    try {
      const res = await this.client.repos.getContent({ owner, repo, path: RECIPES_DIR, ref: branch });
      entries = Array.isArray(res.data) ? res.data : [];
    } catch (err: any) {
      if (err.status === 404) return [];
      throw err;
    }
    const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
    const results = await Promise.all(
      files.map((f) => this.get(f.name.replace(/\.json$/, "")))
    );
    return results.filter((r): r is StoredRecipe => r !== null).map((r) => r.recipe);
  }

  async get(slug: string): Promise<StoredRecipe | null> {
    const { owner, repo, branch } = this.config;
    try {
      const res = await this.client.repos.getContent({ owner, repo, path: this.path(slug), ref: branch });
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
      branch,
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
      branch,
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
      branch,
      path: this.path(slug),
      message: `Delete recipe: ${title}`,
      sha,
    });
  }
}
