import { Octokit } from "@octokit/rest";
import type { RepoRef, Session } from "./session";

export const SHOPPING_LIST_PATH = "data/shopping-list.json";
const MAX_ITEMS = 500;
const MAX_TEXT_LENGTH = 1000;
const MAX_SOURCE_LENGTH = 200;

export interface ShoppingListItem {
  id: string;
  text: string;
  checked: boolean;
  source?: string;
}

export interface StoredShoppingList {
  items: ShoppingListItem[];
  sha: string | null;
}

export class ShoppingListValidationError extends Error {}
export class ShoppingListConfigurationError extends Error {}
export class ShoppingListAccessError extends Error {}
export class ShoppingListConflictError extends Error {}

interface ShoppingListClient {
  repos: {
    get(params: { owner: string; repo: string }): Promise<{ data: any }>;
    getContent(params: { owner: string; repo: string; path: string; ref: string }): Promise<{ data: any }>;
    createOrUpdateFileContents(params: {
      owner: string;
      repo: string;
      path: string;
      branch: string;
      message: string;
      content: string;
      sha?: string;
    }): Promise<{ data: any }>;
  };
}

export function normalizeShoppingListItems(value: unknown): ShoppingListItem[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    throw new ShoppingListValidationError(`Shopping list must contain at most ${MAX_ITEMS} items`);
  }
  const ids = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ShoppingListValidationError(`Item ${index + 1} must be an object`);
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id)) {
      throw new ShoppingListValidationError(`Item ${index + 1} has an invalid or duplicate ID`);
    }
    ids.add(item.id);
    if (typeof item.text !== "string" || !item.text.trim() || item.text.length > MAX_TEXT_LENGTH) {
      throw new ShoppingListValidationError(`Item ${index + 1} text must be 1–${MAX_TEXT_LENGTH} characters`);
    }
    if (typeof item.checked !== "boolean") {
      throw new ShoppingListValidationError(`Item ${index + 1} checked must be true or false`);
    }
    if (item.source !== undefined && (typeof item.source !== "string" ||
        !item.source.trim() || item.source.length > MAX_SOURCE_LENGTH)) {
      throw new ShoppingListValidationError(`Item ${index + 1} source must be 1–${MAX_SOURCE_LENGTH} characters`);
    }
    return {
      id: item.id,
      text: item.text,
      checked: item.checked,
      ...(item.source !== undefined ? { source: item.source as string } : {}),
    };
  });
}

async function verifiedPrivateRepo(session: Session, client: ShoppingListClient): Promise<RepoRef> {
  const repo = session.repo;
  if (!repo || repo.private !== true || !repo.owner || !repo.name || !repo.branch) {
    throw new ShoppingListConfigurationError("Select a private recipe repo in Settings before using a shopping list");
  }
  const response = await client.repos.get({ owner: repo.owner, repo: repo.name });
  if (!response.data.permissions?.push) {
    throw new ShoppingListAccessError("No push access to the selected recipe repo");
  }
  if (response.data.private !== true || response.data.default_branch !== repo.branch) {
    throw new ShoppingListConfigurationError("Recipe repo visibility or default branch changed. Re-select it in Settings.");
  }
  return repo;
}

async function loadFromRepo(client: ShoppingListClient, repo: RepoRef): Promise<StoredShoppingList> {
  let response;
  try {
    response = await client.repos.getContent({
      owner: repo.owner, repo: repo.name, path: SHOPPING_LIST_PATH, ref: repo.branch,
    });
  } catch (error: any) {
    if (error.status === 404) return { items: [], sha: null };
    throw error;
  }
  const file = response.data;
  if (!file || Array.isArray(file) || file.type !== "file" ||
      typeof file.content !== "string" || typeof file.sha !== "string" || !file.sha) {
    throw new Error("Invalid shopping list file in recipe repo");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid shopping list file in recipe repo");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("items" in parsed)) {
    throw new Error("Invalid shopping list file in recipe repo");
  }
  try {
    return { items: normalizeShoppingListItems(parsed.items), sha: file.sha };
  } catch (error) {
    if (error instanceof ShoppingListValidationError) throw new Error("Invalid shopping list file in recipe repo");
    throw error;
  }
}

export async function loadShoppingList(session: Session, client?: ShoppingListClient): Promise<StoredShoppingList> {
  const github = client ?? new Octokit({ auth: session.accessToken });
  const repo = await verifiedPrivateRepo(session, github);
  return loadFromRepo(github, repo);
}

export async function saveShoppingList(
  session: Session,
  items: unknown,
  expectedSha: string | null,
  client?: ShoppingListClient
): Promise<string> {
  const normalized = normalizeShoppingListItems(items);
  if (expectedSha !== null && (typeof expectedSha !== "string" || !/^[a-f0-9]{40}$/i.test(expectedSha))) {
    throw new ShoppingListValidationError("expectedSha must be a GitHub file SHA or null");
  }
  const github = client ?? new Octokit({ auth: session.accessToken });
  const repo = await verifiedPrivateRepo(session, github);
  const current = await loadFromRepo(github, repo);
  if (current.sha !== expectedSha) {
    throw new ShoppingListConflictError("Shopping list changed elsewhere. Reload before saving.");
  }
  let response;
  try {
    response = await github.repos.createOrUpdateFileContents({
      owner: repo.owner,
      repo: repo.name,
      path: SHOPPING_LIST_PATH,
      branch: repo.branch,
      message: "Update shopping list",
      content: Buffer.from(JSON.stringify({ items: normalized }, null, 2)).toString("base64"),
      ...(current.sha ? { sha: current.sha } : {}),
    });
  } catch (error: any) {
    if (error.status === 409 || error.status === 422) {
      throw new ShoppingListConflictError("Shopping list changed elsewhere. Reload before saving.");
    }
    throw error;
  }
  const sha = response.data?.content?.sha;
  if (typeof sha !== "string" || !sha) throw new Error("GitHub did not return a shopping list SHA");
  return sha;
}
