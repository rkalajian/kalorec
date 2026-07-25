import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExtract = vi.fn();

vi.mock("../../src/lib/extract", () => ({
  extractRecipeFromUrl: (url: string) => mockExtract(url),
}));

import { POST } from "../../src/pages/api/import";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/import", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the extracted recipe on success", async () => {
    mockExtract.mockResolvedValue({ recipe: { title: "Soup" } });
    const response = await POST({ request: jsonRequest({ url: "https://example.com/soup" }) } as any);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.recipe.title).toBe("Soup");
  });

  it("rejects a missing url with 400", async () => {
    const response = await POST({ request: jsonRequest({}) } as any);
    expect(response.status).toBe(400);
  });

  it("returns 422 with the error message when extraction fails", async () => {
    mockExtract.mockRejectedValue(new Error("responded with status 404"));
    const response = await POST({ request: jsonRequest({ url: "https://example.com/missing" }) } as any);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error).toMatch(/404/);
  });
});
