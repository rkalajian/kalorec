import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const api = vi.hoisted(() => ({
  getContent: vi.fn(), createOrUpdateFileContents: vi.fn(), getBlob: vi.fn(), getRepo: vi.fn(),
  lookup: vi.fn(), request: vi.fn(),
}));
vi.mock("@octokit/rest", () => ({ Octokit: vi.fn(() => ({ repos: {
  getContent: api.getContent, createOrUpdateFileContents: api.createOrUpdateFileContents, get: api.getRepo,
}, git: { getBlob: api.getBlob } })) }));
vi.mock("node:dns/promises", () => ({ lookup: api.lookup }));
vi.mock("node:https", () => ({ request: api.request }));

import { decodeImageUpload, downloadImage, imageName, imagePath, parseImagePath, readRepoImage, resolveRecipeImage, saveRepoImage } from "../../src/lib/images";
import { GET } from "../../src/pages/api/images/[scope]/[owner]/[repo]/[name]";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const privateRepo = { owner: "rob", name: "recipes", branch: "main", private: true };
const publicRepo = { owner: "rob", name: "shared", branch: "main", private: false };

beforeEach(() => {
  vi.clearAllMocks();
  api.getContent.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
  api.createOrUpdateFileContents.mockResolvedValue({});
});

describe("image storage", () => {
  it("validates upload bytes, MIME, and size", () => {
    expect(decodeImageUpload(`data:image/png;base64,${png.toString("base64")}`)).toEqual(png);
    expect(() => decodeImageUpload(`data:image/jpeg;base64,${png.toString("base64")}`)).toThrow(/match/);
    expect(() => decodeImageUpload(`data:image/png;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64")}`)).toThrow(/4 MB/);
    expect(() => decodeImageUpload("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
  });

  it("stores image bytes in selected private repo and keeps stable content URL", async () => {
    const url = await resolveRecipeImage(undefined, `data:image/png;base64,${png.toString("base64")}`, "token", privateRepo);
    expect(url).toBe(imagePath("private", privateRepo, imageName(png)));
    expect(api.createOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({
      path: `data/images/${imageName(png)}`, owner: "rob", repo: "recipes", content: png.toString("base64"),
    }));
  });

  it("rejects paths outside selected source repo", async () => {
    await expect(resolveRecipeImage(imagePath("private", { ...privateRepo, name: "other" }, imageName(png)), undefined, "token", privateRepo)).rejects.toThrow(/selected/);
    await expect(resolveRecipeImage(imagePath("public", publicRepo, imageName(png)), undefined, "token", privateRepo)).rejects.toThrow(/selected/);
    expect(parseImagePath("/api/images/private/rob/../secret.png")).toBeNull();
  });

  it("rejects internal HTTPS destinations before connecting", async () => {
    api.lookup.mockResolvedValue([{ address: "192.0.2.4", family: 4 }]);
    await expect(downloadImage("https://example.com/photo.png")).rejects.toThrow(/public address/);
    expect(api.request).not.toHaveBeenCalled();
  });

  it("downloads a supported HTTPS image from a pinned public address", async () => {
    api.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    api.request.mockImplementation((_url: URL, options: any, callback: (response: any) => void) => {
      const request = new EventEmitter() as any;
      request.end = () => {
        const response = new EventEmitter() as any;
        response.statusCode = 200;
        response.headers = { "content-length": String(png.length) };
        callback(response);
        response.emit("data", png);
        response.emit("end");
      };
      expect(options.lookup).toBeTypeOf("function");
      return request;
    });
    expect(await downloadImage("https://example.com/photo.png")).toEqual(png);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("rechecks redirected hosts and blocks internal destinations", async () => {
    api.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    api.request.mockImplementation((_url: URL, _options: any, callback: (response: any) => void) => {
      const request = new EventEmitter() as any;
      request.end = () => {
        const response = new EventEmitter() as any;
        response.statusCode = 302;
        response.headers = { location: "https://localhost/secret" };
        response.resume = () => {};
        callback(response);
      };
      return request;
    });
    await expect(downloadImage("https://example.com/photo.png")).rejects.toThrow(/public address/);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("reads large GitHub blobs and verifies content hash", async () => {
    api.getContent.mockResolvedValue({ data: { type: "file", content: "", sha: "blob-sha" } });
    api.getBlob.mockResolvedValue({ data: { content: png.toString("base64") } });
    expect(await readRepoImage("token", privateRepo, "private", imageName(png))).toEqual(png);
    expect(api.getBlob).toHaveBeenCalledWith(expect.objectContaining({ file_sha: "blob-sha" }));
  });

  it("reuses existing content address without another write", async () => {
    api.getContent.mockResolvedValue({ data: { type: "file" } });
    await saveRepoImage("token", privateRepo, "private", png);
    expect(api.createOrUpdateFileContents).not.toHaveBeenCalled();
  });
});

describe("image route", () => {
  it("never serves private images from another repo", async () => {
    const response = await GET({ params: { scope: "private", owner: "other", repo: "recipes", name: imageName(png) },
      locals: { session: { repo: privateRepo, accessToken: "token" } } } as any);
    expect(response.status).toBe(404);
    expect(api.getContent).not.toHaveBeenCalled();
  });

  it("serves an authorized private image with nosniff", async () => {
    api.getContent.mockResolvedValue({ data: { type: "file", content: png.toString("base64") } });
    const response = await GET({ params: { scope: "private", owner: "rob", repo: "recipes", name: imageName(png) },
      locals: { session: { repo: privateRepo, accessToken: "token" } } } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  });

  it("checks public repository visibility before reading image", async () => {
    api.getRepo.mockResolvedValue({ data: { private: true, default_branch: "main" } });
    const response = await GET({ params: { scope: "public", owner: "rob", repo: "shared", name: imageName(png) }, locals: {} } as any);
    expect(response.status).toBe(404);
    expect(api.getContent).not.toHaveBeenCalled();
  });
});
