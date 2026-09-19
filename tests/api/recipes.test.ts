// tests/api/recipes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};

vi.mock("../../src/lib/store", () => ({
  getStore: vi.fn(() => mockStore),
}));

const mockPublishRecipe = vi.fn(async (..._args: unknown[]) => {});
const mockUnpublishRecipe = vi.fn(async (..._args: unknown[]) => {});
const mockSharingStore = {};
vi.mock("../../src/lib/publishing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/publishing")>()),
  getSharingStore: vi.fn(() => mockSharingStore),
  publishRecipe: (...args: unknown[]) => mockPublishRecipe(...args),
  unpublishRecipe: (...args: unknown[]) => mockUnpublishRecipe(...args),
  verifySharingRepos: vi.fn(async () => {}),
}));

import { getStore } from "../../src/lib/store";
import { POST } from "../../src/pages/api/recipes/index";
import { PUT, DELETE } from "../../src/pages/api/recipes/[slug]";

const fakeSession = {
  accessToken: "tok",
  repo: { owner: "rob", name: "recipes", branch: "main", private: true },
  sharingRepo: { owner: "rob", name: "shared-recipes", branch: "main", private: false },
};

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const existingRecipe = {
  slug: "chili",
  title: "Chili",
  tags: ["dinner"],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("POST /api/recipes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a recipe and returns its slug", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", {
        title: "Grandma's Chili",
        tags: ["Dinner", " spicy "],
        ingredients: ["beef"],
        instructions: ["cook"],
      }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.slug).toBe("grandma-s-chili");
    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "grandma-s-chili", tags: ["dinner", "spicy"] })
    );
    expect(getStore).toHaveBeenCalledWith({ accessToken: fakeSession.accessToken, repo: fakeSession.repo });
  });

  it("returns 401 and clears the session cookie when the GitHub token is revoked", async () => {
    mockStore.list.mockRejectedValue(Object.assign(new Error("Bad credentials"), { status: 401 }));
    const cookieDelete = vi.fn();
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili" }),
      locals: { session: fakeSession },
      cookies: { delete: cookieDelete },
    } as any);
    expect(response.status).toBe(401);
    expect(cookieDelete).toHaveBeenCalled();
    const json = await response.json();
    expect(json.error).not.toMatch(/Bad credentials/);
  });

  it("rejects a missing title with 400", async () => {
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", {}),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
  });

  it("rejects unsafe URLs and oversized titles before reading GitHub", async () => {
    for (const body of [
      { title: "Chili", sourceUrl: "javascript:alert(1)" },
      { title: "Chili", image: "http://example.com/image.jpg" },
      { title: "x".repeat(201) },
    ]) {
      const response = await POST({
        request: jsonRequest("http://localhost/api/recipes", "POST", body),
        locals: { session: fakeSession },
      } as any);
      expect(response.status).toBe(400);
    }
    expect(mockStore.list).not.toHaveBeenCalled();
  });

  it("returns 502 when the GitHub write fails", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockRejectedValue(new Error("rate limited"));
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(502);
  });

  it("returns 400 on malformed JSON body", async () => {
    const response = await POST({
      request: new Request("http://localhost/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
  });

  it("dedupes case-insensitive tags", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", {
        title: "Chili",
        tags: ["dinner", "Dinner", " DINNER "],
      }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(expect.objectContaining({ tags: ["dinner"] }));
  });

  it("collapses an all-empty nutrition object to undefined", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", {
        title: "Chili",
        nutrition: { calories: "", protein: "", fat: "", carbohydrates: "", fiber: "", sugar: "", sodium: "" },
      }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(expect.objectContaining({ nutrition: undefined }));
  });

  it("drops empty-string optional fields instead of persisting them", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", {
        title: "Chili",
        servings: "",
        prepTime: "",
      }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ servings: undefined, prepTime: undefined })
    );
  });

  it("coerces non-string ingredients/instructions to trimmed strings", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", {
        title: "Chili",
        ingredients: [1, "  2 cups flour  "],
        instructions: [true],
      }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ ingredients: ["1", "2 cups flour"], instructions: ["true"] })
    );
  });

  it("defaults public to false when omitted", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(expect.objectContaining({ public: false }));
  });

  it("sets public to true when requested", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili", public: true }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(expect.objectContaining({ public: true }));
    expect(mockPublishRecipe).toHaveBeenCalledWith(mockSharingStore, expect.objectContaining({ public: true }));
  });

  it("rejects sharing without a configured public repo before writing the source", async () => {
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili", public: true }),
      locals: { session: { ...fakeSession, sharingRepo: null } },
    } as any);
    expect(response.status).toBe(409);
    expect(mockStore.create).not.toHaveBeenCalled();
  });

  it("reports a saved private source when publication fails", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    mockPublishRecipe.mockRejectedValueOnce(new Error("GitHub unavailable"));
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili", public: true }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(207);
    expect(await response.json()).toEqual(expect.objectContaining({ slug: "chili", warning: expect.any(String) }));
    expect(mockStore.create).toHaveBeenCalled();
  });

  it("rejects string sharing flags", async () => {
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili", public: "false" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
    expect(mockStore.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/recipes/[slug]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates an existing recipe", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Chili Updated" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(200);
    expect(mockStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Chili Updated" }),
      "sha-1"
    );
    expect(getStore).toHaveBeenCalledWith({ accessToken: fakeSession.accessToken, repo: fakeSession.repo });
  });

  it("returns 404 when the recipe does not exist", async () => {
    mockStore.get.mockResolvedValue(null);
    const response = await PUT({
      params: { slug: "missing" },
      request: jsonRequest("http://localhost/api/recipes/missing", "PUT", { title: "X" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(404);
  });

  it("returns 401 and clears the session cookie when the GitHub token is revoked", async () => {
    mockStore.get.mockRejectedValue(Object.assign(new Error("Bad credentials"), { status: 401 }));
    const cookieDelete = vi.fn();
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "X" }),
      locals: { session: fakeSession },
      cookies: { delete: cookieDelete },
    } as any);
    expect(response.status).toBe(401);
    expect(cookieDelete).toHaveBeenCalled();
    const json = await response.json();
    expect(json.error).not.toMatch(/Bad credentials/);
  });

  it("returns 409 on sha mismatch", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-2" });
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", {
        title: "Chili Updated",
        expectedSha: "sha-1",
      }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(409);
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it("rejects an empty-string title with 400", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-1" });
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "   " }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it("rejects unsafe URL updates", async () => {
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { sourceUrl: "javascript:alert(1)" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
    expect(mockStore.get).not.toHaveBeenCalled();
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it("drops unsafe URLs from an existing recipe when saving other changes", async () => {
    mockStore.get.mockResolvedValue({
      recipe: { ...existingRecipe, sourceUrl: "javascript:alert(1)", image: "http://example.com/photo.jpg" },
      sha: "sha-1",
    });
    mockStore.update.mockResolvedValue(undefined);
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Updated chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(200);
    expect(mockStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: undefined, image: undefined }),
      "sha-1"
    );
  });

  it("returns 400 on malformed JSON body", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-1" });
    const response = await PUT({
      params: { slug: "chili" },
      request: new Request("http://localhost/api/recipes/chili", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
  });

  it("drops an empty-string field instead of preserving it (matches POST's normalization)", async () => {
    mockStore.get.mockResolvedValue({
      recipe: { ...existingRecipe, servings: "4" },
      sha: "sha-1",
    });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", {
        title: "Chili",
        servings: "",
      }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ servings: undefined }),
      "sha-1"
    );
  });

  it("collapses an all-empty nutrition object to undefined", async () => {
    mockStore.get.mockResolvedValue({
      recipe: { ...existingRecipe, nutrition: { calories: "200" } },
      sha: "sha-1",
    });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", {
        title: "Chili",
        nutrition: { calories: "", protein: "", fat: "", carbohydrates: "", fiber: "", sugar: "", sodium: "" },
      }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ nutrition: undefined }),
      "sha-1"
    );
  });

  it("dedupes case-insensitive tags", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", {
        title: "Chili",
        tags: ["dinner", "Dinner"],
      }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["dinner"] }),
      "sha-1"
    );
  });

  it("leaves a field untouched when omitted from the body entirely", async () => {
    mockStore.get.mockResolvedValue({
      recipe: { ...existingRecipe, servings: "4" },
      sha: "sha-1",
    });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ servings: "4" }),
      "sha-1"
    );
  });

  it("updates the public flag when provided", async () => {
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: false }, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Chili", public: true }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(expect.objectContaining({ public: true }), "sha-1");
    expect(mockPublishRecipe).toHaveBeenCalledWith(mockSharingStore, expect.objectContaining({ public: true }));
  });

  it("removes a public copy before saving an unshared source", async () => {
    const order: string[] = [];
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: true }, sha: "sha-1" });
    mockUnpublishRecipe.mockImplementationOnce(async () => { order.push("unpublish"); });
    mockStore.update.mockImplementationOnce(async () => { order.push("source update"); });
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { public: false }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(200);
    expect(order).toEqual(["unpublish", "source update"]);
    expect(mockStore.update).toHaveBeenCalledWith(expect.objectContaining({ public: false }), "sha-1");
  });

  it("keeps the source shared when removing the public copy fails", async () => {
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: true }, sha: "sha-1" });
    mockUnpublishRecipe.mockRejectedValueOnce(new Error("GitHub unavailable"));
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { public: false }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(502);
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it("requires the original sharing repo before unsharing", async () => {
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: true }, sha: "sha-1" });
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { public: false }),
      locals: { session: { ...fakeSession, sharingRepo: null } },
    } as any);
    expect(response.status).toBe(409);
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it("reports partial success when updating a public copy fails", async () => {
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: true }, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    mockPublishRecipe.mockRejectedValueOnce(new Error("GitHub unavailable"));
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "New chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(207);
    expect(mockStore.update).toHaveBeenCalled();
  });

  it("leaves the public flag untouched when omitted from the body", async () => {
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: true }, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(expect.objectContaining({ public: true }), "sha-1");
  });
});

describe("DELETE /api/recipes/[slug]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes an existing recipe", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-1" });
    mockStore.remove.mockResolvedValue(undefined);
    const response = await DELETE({ params: { slug: "chili" }, locals: { session: fakeSession } } as any);
    expect(response.status).toBe(204);
    expect(mockStore.remove).toHaveBeenCalledWith("chili", "sha-1", "Chili");
    expect(getStore).toHaveBeenCalledWith({ accessToken: fakeSession.accessToken, repo: fakeSession.repo });
  });

  it("removes the public copy before deleting a shared source", async () => {
    const order: string[] = [];
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: true }, sha: "sha-1" });
    mockUnpublishRecipe.mockImplementationOnce(async () => { order.push("unpublish"); });
    mockStore.remove.mockImplementationOnce(async () => { order.push("source delete"); });
    const response = await DELETE({ params: { slug: "chili" }, locals: { session: fakeSession } } as any);
    expect(response.status).toBe(204);
    expect(order).toEqual(["unpublish", "source delete"]);
  });

  it("returns 404 when the recipe does not exist", async () => {
    mockStore.get.mockResolvedValue(null);
    const response = await DELETE({ params: { slug: "missing" }, locals: { session: fakeSession } } as any);
    expect(response.status).toBe(404);
  });

  it("returns 401 and clears the session cookie when the GitHub token is revoked", async () => {
    mockStore.get.mockRejectedValue(Object.assign(new Error("Bad credentials"), { status: 401 }));
    const cookieDelete = vi.fn();
    const response = await DELETE({
      params: { slug: "chili" },
      locals: { session: fakeSession },
      cookies: { delete: cookieDelete },
    } as any);
    expect(response.status).toBe(401);
    expect(cookieDelete).toHaveBeenCalled();
    const json = await response.json();
    expect(json.error).not.toMatch(/Bad credentials/);
  });
});
