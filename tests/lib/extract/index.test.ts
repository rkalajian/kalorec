// tests/lib/extract/index.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { extractRecipeFromUrl } from "../../../src/lib/extract";

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonLdHtml = `<html><head><script type="application/ld+json">
{"@type":"Recipe","name":"Soup","recipeIngredient":["water"],"recipeInstructions":["Boil it."]}
</script></head><body></body></html>`;

const plainHtml = `<html><head><title>Blog</title></head><body><h1>Blog</h1></body></html>`;

describe("extractRecipeFromUrl", () => {
  it("returns a recipe with no warning when JSON-LD is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(jsonLdHtml, { status: 200 })));
    const result = await extractRecipeFromUrl("https://example.com/soup");
    expect(result.recipe.title).toBe("Soup");
    expect(result.recipe.sourceUrl).toBe("https://example.com/soup");
    expect(result.warning).toBeUndefined();
  });

  it("falls back with a warning when no JSON-LD is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(plainHtml, { status: 200 })));
    const result = await extractRecipeFromUrl("https://example.com/blog");
    expect(result.recipe.title).toBe("Blog");
    expect(result.warning).toMatch(/heuristically/);
  });

  it("throws when the response is not OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(extractRecipeFromUrl("https://example.com/missing")).rejects.toThrow(/404/);
  });

  it("throws when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(extractRecipeFromUrl("https://example.com/down")).rejects.toThrow(/network down/);
  });

  it("rejects a non-http(s) scheme without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractRecipeFromUrl("file:///etc/passwd")).rejects.toThrow(/scheme/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a loopback hostname without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractRecipeFromUrl("http://127.0.0.1/x")).rejects.toThrow(/private|internal/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects the localhost hostname without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractRecipeFromUrl("http://localhost/x")).rejects.toThrow(/private|internal/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects private RFC1918 and link-local ranges", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const url of ["http://10.0.0.5/x", "http://172.16.0.1/x", "http://192.168.1.1/x", "http://169.254.169.254/x"]) {
      await expect(extractRecipeFromUrl(url)).rejects.toThrow(/private|internal/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a response whose Content-Length exceeds the size cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(jsonLdHtml, { status: 200, headers: { "content-length": String(10 * 1024 * 1024) } }))
    );
    await expect(extractRecipeFromUrl("https://example.com/huge")).rejects.toThrow(/size/i);
  });

  it("passes an AbortSignal to fetch for the timeout", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(jsonLdHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await extractRecipeFromUrl("https://example.com/soup");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
