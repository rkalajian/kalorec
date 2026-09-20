import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadShoppingList, saveShoppingList } = vi.hoisted(() => ({
  loadShoppingList: vi.fn(), saveShoppingList: vi.fn(),
}));
vi.mock("../../src/lib/shoppingList", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/shoppingList")>()),
  loadShoppingList, saveShoppingList,
}));

import { GET, PUT } from "../../src/pages/api/shopping-list";
import { ShoppingListConflictError, ShoppingListValidationError } from "../../src/lib/shoppingList";

const session = {
  githubLogin: "rob", accessToken: "token",
  repo: { owner: "rob", name: "private", branch: "main", private: true },
};
const cookies = { delete: vi.fn() };

function context(body?: unknown, activeSession: unknown = session) {
  return {
    locals: { session: activeSession }, cookies,
    request: new Request("http://localhost/api/shopping-list", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  } as any;
}

describe("/api/shopping-list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadShoppingList.mockResolvedValue({ items: [], sha: null });
    saveShoppingList.mockResolvedValue("a".repeat(40));
  });

  it("rejects anonymous reads and writes before touching GitHub", async () => {
    expect((await GET(context(undefined, null))).status).toBe(401);
    expect((await PUT(context({ items: [], expectedSha: null }, null))).status).toBe(401);
    expect(loadShoppingList).not.toHaveBeenCalled();
    expect(saveShoppingList).not.toHaveBeenCalled();
  });

  it("returns private items with no-store cache headers", async () => {
    const response = await GET(context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ items: [], sha: null });
    expect(loadShoppingList).toHaveBeenCalledWith(session);
  });

  it("passes the expected SHA to storage and returns its new SHA", async () => {
    const items = [{ id: "abc", text: "milk", checked: false }];
    const expectedSha = "b".repeat(40);
    const response = await PUT(context({ items, expectedSha }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sha: "a".repeat(40) });
    expect(saveShoppingList).toHaveBeenCalledWith(session, items, expectedSha);
  });

  it("returns clear validation and conflict errors", async () => {
    expect((await PUT(context({ items: [] }))).status).toBe(400);
    saveShoppingList.mockRejectedValueOnce(new ShoppingListValidationError("Invalid item"));
    expect((await PUT(context({ items: [], expectedSha: null }))).status).toBe(400);
    saveShoppingList.mockRejectedValueOnce(new ShoppingListConflictError("Changed elsewhere"));
    const response = await PUT(context({ items: [], expectedSha: null }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Changed elsewhere/);
  });

  it("accepts the largest ordinary list and stops an oversized body before saving", async () => {
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: `item_${index}`, text: "x".repeat(1000), checked: false, source: "s".repeat(200),
    }));
    expect((await PUT(context({ items, expectedSha: null }))).status).toBe(200);
    expect(saveShoppingList).toHaveBeenCalledOnce();
    const oversized = { items, expectedSha: null, padding: "x".repeat(900_000) };
    expect((await PUT(context(oversized))).status).toBe(413);
    expect(saveShoppingList).toHaveBeenCalledOnce();
  });

  it("clears expired sessions and reports other GitHub failures", async () => {
    loadShoppingList.mockRejectedValueOnce(Object.assign(new Error("Bad credentials"), { status: 401 }));
    expect((await GET(context())).status).toBe(401);
    expect(cookies.delete).toHaveBeenCalledWith("session", { path: "/" });
    saveShoppingList.mockRejectedValueOnce(new Error("network"));
    expect((await PUT(context({ items: [], expectedSha: null }))).status).toBe(502);
  });
});
