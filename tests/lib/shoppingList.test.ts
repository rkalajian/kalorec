import { describe, expect, it, vi } from "vitest";
import {
  SHOPPING_LIST_PATH, loadShoppingList, normalizeShoppingListItems, saveShoppingList,
  ShoppingListAccessError, ShoppingListConfigurationError, ShoppingListConflictError,
  ShoppingListValidationError,
} from "../../src/lib/shoppingList";
import type { Session } from "../../src/lib/session";

const SHA = "a".repeat(40);
const NEXT_SHA = "b".repeat(40);
const session: Session = {
  githubLogin: "rob", accessToken: "private-token",
  repo: { owner: "rob", name: "private-recipes", branch: "main", private: true },
  sharingRepo: { owner: "rob", name: "public-recipes", branch: "main", private: false },
};
const item = { id: "item_1", text: "  2 eggs  ", checked: false, source: "  Omelet  " };

function client(file: any = null) {
  const get = vi.fn(async () => ({ data: { private: true, default_branch: "main", permissions: { push: true } } }));
  const getContent = vi.fn(async (): Promise<any> => {
    if (!file) throw Object.assign(new Error("Not found"), { status: 404 });
    return { data: file };
  });
  const createOrUpdateFileContents = vi.fn(async (_params: any) => ({ data: { content: { sha: NEXT_SHA } } }));
  return { repos: { get, getContent, createOrUpdateFileContents } };
}

function stored(items: unknown = [item]) {
  return { type: "file", sha: SHA, content: Buffer.from(JSON.stringify({ items })).toString("base64") };
}

describe("shopping list validation", () => {
  it("preserves raw item text and source while dropping unknown fields", () => {
    expect(normalizeShoppingListItems([{ ...item, secret: "omit" }])).toEqual([
      { id: "item_1", text: "  2 eggs  ", checked: false, source: "  Omelet  " },
    ]);
  });

  it("rejects duplicate IDs, invalid fields, and oversized lists", () => {
    expect(() => normalizeShoppingListItems([item, item])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems([{ ...item, checked: "false" }])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems([{ ...item, text: "  " }])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems([{ ...item, text: "x".repeat(1001) }])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems([{ ...item, text: ` ${"x".repeat(1000)} ` }])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems([{ ...item, id: "../elsewhere" }])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems([{ ...item, source: "x".repeat(201) }])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems([{ ...item, source: ` ${"x".repeat(200)} ` }])).toThrow(ShoppingListValidationError);
    expect(() => normalizeShoppingListItems(Array(501).fill(item))).toThrow(ShoppingListValidationError);
  });
});

describe("private shopping list storage", () => {
  it("returns an empty list for a missing file and reads only the selected source repo", async () => {
    const github = client();
    expect(await loadShoppingList(session, github)).toEqual({ items: [], sha: null });
    expect(github.repos.get).toHaveBeenCalledWith({ owner: "rob", repo: "private-recipes" });
    expect(github.repos.getContent).toHaveBeenCalledWith({
      owner: "rob", repo: "private-recipes", path: SHOPPING_LIST_PATH, ref: "main",
    });
    expect(github.repos.getContent).not.toHaveBeenCalledWith(expect.objectContaining({ repo: "public-recipes" }));
  });

  it("rejects a public source, revoked push access, and changed default branch", async () => {
    const github = client();
    await expect(loadShoppingList({ ...session, repo: { ...session.repo!, private: false } }, github))
      .rejects.toThrow(ShoppingListConfigurationError);
    expect(github.repos.get).not.toHaveBeenCalled();
    github.repos.get.mockResolvedValueOnce({ data: { private: false, default_branch: "main", permissions: { push: true } } });
    await expect(loadShoppingList(session, github)).rejects.toThrow(ShoppingListConfigurationError);
    github.repos.get.mockResolvedValueOnce({ data: { private: true, default_branch: "main", permissions: { push: false } } });
    await expect(saveShoppingList(session, [], null, github)).rejects.toThrow(ShoppingListAccessError);
    github.repos.get.mockResolvedValueOnce({ data: { private: true, default_branch: "other", permissions: { push: true } } });
    await expect(saveShoppingList(session, [], null, github)).rejects.toThrow(ShoppingListConfigurationError);
    expect(github.repos.getContent).not.toHaveBeenCalled();
    expect(github.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it("creates the file with sanitized fields and returns the new GitHub SHA", async () => {
    const github = client();
    expect(await saveShoppingList(session, [{ ...item, hidden: "secret" }], null, github)).toBe(NEXT_SHA);
    const write = github.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(write).toMatchObject({ owner: "rob", repo: "private-recipes", path: SHOPPING_LIST_PATH, branch: "main" });
    expect(write).not.toHaveProperty("sha");
    expect(JSON.parse(Buffer.from(write.content, "base64").toString("utf8"))).toEqual({
      items: [{ id: "item_1", text: "  2 eggs  ", checked: false, source: "  Omelet  " }],
    });
  });

  it("saves an empty list after every item is removed", async () => {
    const github = client(stored());
    expect(await saveShoppingList(session, [], SHA, github)).toBe(NEXT_SHA);
    const write = github.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(JSON.parse(Buffer.from(write.content, "base64").toString("utf8"))).toEqual({ items: [] });
  });

  it("uses the current file SHA on update and rejects stale writes", async () => {
    const github = client(stored());
    expect(await loadShoppingList(session, github)).toEqual({
      items: [{ id: "item_1", text: "  2 eggs  ", checked: false, source: "  Omelet  " }], sha: SHA,
    });
    await expect(saveShoppingList(session, [item], null, github)).rejects.toThrow(ShoppingListConflictError);
    await expect(saveShoppingList(session, [item], "c".repeat(40), github)).rejects.toThrow(ShoppingListConflictError);
    expect(github.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    expect(await saveShoppingList(session, [item], SHA, github)).toBe(NEXT_SHA);
    expect(github.repos.createOrUpdateFileContents.mock.calls[0][0]).toMatchObject({ sha: SHA });
  });

  it("maps a concurrent GitHub write failure to a conflict", async () => {
    const github = client(stored());
    github.repos.createOrUpdateFileContents.mockRejectedValueOnce(Object.assign(new Error("Conflict"), { status: 409 }));
    await expect(saveShoppingList(session, [item], SHA, github)).rejects.toThrow(ShoppingListConflictError);
  });

  it("fails closed for malformed stored data", async () => {
    const github = client(stored([{ ...item, id: "../other" }]));
    await expect(loadShoppingList(session, github)).rejects.toThrow("Invalid shopping list file");
    expect(github.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });
});
