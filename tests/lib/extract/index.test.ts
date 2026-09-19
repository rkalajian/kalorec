import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { extractRecipeFromUrl } from "../../../src/lib/extract";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("node:http", () => ({ request: vi.fn() }));
const jsonLdHtml = `<script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeIngredient":["water"],"recipeInstructions":["Boil it."]}</script>`;
type Page = { status?: number; headers?: Record<string, string>; chunks?: Buffer[]; error?: string };
let pages: Page[];
let connections: { url: URL; options: any }[];
beforeEach(() => {
  vi.resetAllMocks();
  pages = [{}];
  connections = [];
  vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
  vi.mocked(request).mockImplementation(((url: URL, options: any, callback: any) => {
    connections.push({ url, options });
    const page = pages.shift() ?? {};
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => queueMicrotask(() => {
      if (page.error) { req.emit("error", new Error(page.error)); return; }
      const response = Readable.from(page.chunks ?? [Buffer.from(jsonLdHtml)]);
      Object.assign(response, { statusCode: page.status ?? 200, headers: page.headers ?? {} });
      callback(response);
    });
    return req;
  }) as any);
  vi.mocked(httpRequest).mockImplementation(request as any);
});

describe("extractRecipeFromUrl", () => {
  it("extracts structured recipes and preserves the source URL", async () => {
    const result = await extractRecipeFromUrl("https://example.com/soup");
    expect(result.recipe.title).toBe("Soup");
    expect(result.recipe.sourceUrl).toBe("https://example.com/soup");
    expect(result.warning).toBeUndefined();
  });
  it("uses HTTP for an HTTP source URL", async () => {
    const result = await extractRecipeFromUrl("http://example.com/soup");
    expect(result.recipe.title).toBe("Soup");
    expect(httpRequest).toHaveBeenCalledOnce();
    expect(connections[0].url.protocol).toBe("http:");
  });
  it("falls back with a warning", async () => {
    pages = [{ chunks: [Buffer.from("<h1>Blog</h1>")] }];
    expect((await extractRecipeFromUrl("https://example.com")).warning).toMatch(/heuristically/);
  });
  it.each(["file:///etc/passwd", "http://localhost/x", "http://127.1/x", "http://10.0.0.1", "http://172.16.0.1", "http://192.168.1.1", "http://169.254.169.254", "http://100.64.0.1", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://[fd12::1]", "http://[fe80::1]", "https://user:pass@example.com"])("blocks unsafe target %s before connecting", async (url) => {
    await expect(extractRecipeFromUrl(url)).rejects.toThrow();
    expect(connections).toHaveLength(0);
  });
  it("rejects DNS answers containing any private address", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }] as any);
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/private/);
    expect(connections).toHaveLength(0);
  });
  it("pins connection DNS to validated addresses and passes timeout signal", async () => {
    await extractRecipeFromUrl("https://example.com");
    const callback = vi.fn();
    connections[0].options.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(connections[0].options.signal).toBeInstanceOf(AbortSignal);
    expect(connections[0].options.agent).toBe(false);
  });
  it("follows relative public redirects after checking DNS again", async () => {
    pages = [{ status: 302, headers: { location: "/soup" } }, {}];
    expect((await extractRecipeFromUrl("https://example.com/start")).recipe.title).toBe("Soup");
    expect(connections[1].url.href).toBe("https://example.com/soup");
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it("blocks a redirect to a private IP", async () => {
    pages = [{ status: 302, headers: { location: "http://169.254.169.254" } }];
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/private/);
    expect(connections).toHaveLength(1);
  });
  it("blocks a redirect whose hostname resolves privately", async () => {
    pages = [{ status: 302, headers: { location: "https://internal.example" } }];
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as any).mockResolvedValueOnce([{ address: "192.168.0.1", family: 4 }] as any);
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/private/);
    expect(connections).toHaveLength(1);
  });
  it("limits redirect loops", async () => {
    pages = Array.from({ length: 6 }, () => ({ status: 302, headers: { location: "/again" } }));
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/Too many redirects/);
  });
  it.each([undefined, "1", String(10 * 1024 * 1024)])("limits bytes with Content-Length %s", async (length) => {
    pages = [{ headers: length ? { "content-length": length } : {}, chunks: [Buffer.alloc(3 * 1024 * 1024), Buffer.alloc(3 * 1024 * 1024)] }];
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/size/);
  });
  it("reports HTTP and connection errors", async () => {
    pages = [{ status: 404 }, { error: "network down" }];
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/404/);
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/network down/);
  });
  it("supports compressed pages and caps decompressed bytes", async () => {
    pages = [{ headers: { "content-encoding": "gzip" }, chunks: [gzipSync(jsonLdHtml)] }];
    expect((await extractRecipeFromUrl("https://example.com")).recipe.title).toBe("Soup");
    pages = [{ headers: { "content-encoding": "gzip" }, chunks: [gzipSync(Buffer.alloc(6 * 1024 * 1024))] }];
    await expect(extractRecipeFromUrl("https://example.com")).rejects.toThrow(/size/);
  });
});
