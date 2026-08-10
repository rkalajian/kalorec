import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
vi.mock("../../src/lib/store", () => ({ getStore: vi.fn(() => mockStore) }));

const mockGetPublicRecipe = vi.fn();
vi.mock("../../src/lib/publicStore", () => ({ getPublicRecipe: (...args: any[]) => mockGetPublicRecipe(...args) }));

import { getStore } from "../../src/lib/store";
import { POST } from "../../src/pages/api/recipes/copy";

const fakeSession = { accessToken: "tok", repo: { owner: "rob", name: "recipes", branch: "main", private: false } };

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/recipes/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sourceRecipe = {
  slug: "chili",
  title: "Chili",
  public: true,
  tags: ["dinner"],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

describe("POST /api/recipes/copy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies a public recipe into the caller's repo as private with a fresh slug", async () => {
    mockGetPublicRecipe.mockResolvedValue(sourceRecipe);
    mockStore.list.mockResolvedValue([{ slug: "chili" }]);
    mockStore.create.mockResolvedValue(undefined);

    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
    } as any);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.slug).toBe("chili-2");
    expect(mockGetPublicRecipe).toHaveBeenCalledWith("amy", "cookbook", "chili");
    expect(getStore).toHaveBeenCalledWith({ accessToken: fakeSession.accessToken, repo: fakeSession.repo });
    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "chili-2", title: "Chili", public: false })
    );
  });

  it("returns 404 when the source recipe is missing or not public", async () => {
    mockGetPublicRecipe.mockResolvedValue(null);
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(404);
    expect(mockStore.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the caller has no repo configured", async () => {
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: { accessToken: "tok", repo: null } },
    } as any);
    expect(response.status).toBe(409);
    expect(mockGetPublicRecipe).not.toHaveBeenCalled();
  });

  it("returns 400 when owner, repo, or slug is missing", async () => {
    const response = await POST({
      request: jsonRequest({ owner: "amy" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
  });

  it("returns 400 on malformed JSON body", async () => {
    const response = await POST({
      request: new Request("http://localhost/api/recipes/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
  });

  it("returns 401 and clears the session cookie when the destination GitHub token is revoked", async () => {
    mockGetPublicRecipe.mockResolvedValue(sourceRecipe);
    mockStore.list.mockRejectedValue(Object.assign(new Error("Bad credentials"), { status: 401 }));
    const cookieDelete = vi.fn();
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
      cookies: { delete: cookieDelete },
    } as any);
    expect(response.status).toBe(401);
    expect(cookieDelete).toHaveBeenCalled();
  });

  it("returns 502 when the source recipe fetch fails", async () => {
    mockGetPublicRecipe.mockRejectedValue(new Error("network error"));
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(502);
  });
});
