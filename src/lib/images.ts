import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Octokit } from "@octokit/rest";
import type { RepoRef } from "./session";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_NAME = /^[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/;
const REPO_NAME = /^[A-Za-z0-9_.-]+$/;
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");

export class ImageInputError extends Error {}

function imageType(bytes: Buffer): { ext: string; mime: string } | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: "png", mime: "image/png" };
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return { ext: "gif", mime: "image/gif" };
  return null;
}

export function decodeImageUpload(value: unknown): Buffer {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 128) throw new ImageInputError("Image exceeds 4 MB");
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new ImageInputError("Upload a PNG, JPEG, WebP, or GIF image");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ImageInputError("Image exceeds 4 MB");
  const type = imageType(bytes);
  if (!type || type.mime !== `image/${match[1]}`) throw new ImageInputError("Image content does not match its type");
  return bytes;
}

function publicAddress(address: string): boolean {
  const kind = isIP(address);
  return kind === 4 ? !blocked.check(address, "ipv4") :
    kind === 6 ? globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6") : false;
}

async function fetchOne(url: URL): Promise<{ status: number; location?: string; bytes?: Buffer }> {
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !url.hostname || url.href.length > 2048) {
    throw new ImageInputError("Image URL must be a public HTTPS URL");
  }
  const records = await dnsLookup(url.hostname, { all: true });
  if (!records.length || records.some((record) => !publicAddress(record.address))) throw new ImageInputError("Image URL must resolve to a public address");
  const selected = records[0];
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "GET", timeout: 10000, agent: false,
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      },
    }, (res) => {
      const status = res.statusCode ?? 502;
      if (status >= 300 && status < 400) { res.resume(); resolve({ status, location: res.headers.location }); return; }
      if (status !== 200) { res.resume(); reject(new ImageInputError("Could not download image")); return; }
      const length = Number(res.headers["content-length"] ?? 0);
      if (length > MAX_IMAGE_BYTES) { res.destroy(); reject(new ImageInputError("Image exceeds 4 MB")); return; }
      const parts: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) { res.destroy(); reject(new ImageInputError("Image exceeds 4 MB")); return; }
        parts.push(chunk);
      });
      res.on("end", () => resolve({ status, bytes: Buffer.concat(parts) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new ImageInputError("Image download timed out")));
    req.on("error", reject);
    req.end();
  });
}

export async function downloadImage(rawUrl: string): Promise<Buffer> {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const result = await fetchOne(url);
    if (result.bytes) {
      if (!result.bytes.length || !imageType(result.bytes)) throw new ImageInputError("URL did not return a supported image");
      return result.bytes;
    }
    if (!result.location || redirects === 3) throw new ImageInputError("Image has too many redirects");
    url = new URL(result.location, url);
  }
  throw new ImageInputError("Could not download image");
}

export function imagePath(scope: "private" | "public", repo: RepoRef, name: string): string {
  if (!REPO_NAME.test(repo.owner) || !REPO_NAME.test(repo.name) || !IMAGE_NAME.test(name) || repo.owner.includes("..") || repo.name.includes("..")) throw new ImageInputError("Invalid image path");
  return `/api/images/${scope}/${repo.owner}/${repo.name}/${name}`;
}

export function parseImagePath(value: string): { scope: "private" | "public"; owner: string; repo: string; name: string } | null {
  const match = /^\/api\/images\/(private|public)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))$/.exec(value);
  if (!match || match[2].includes("..") || match[3].includes("..")) return null;
  return { scope: match[1] as "private" | "public", owner: match[2], repo: match[3], name: match[4] };
}

export function imageName(bytes: Buffer): string {
  const type = imageType(bytes);
  if (!type || !bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ImageInputError("Upload a PNG, JPEG, WebP, or GIF image up to 4 MB");
  return `${createHash("sha256").update(bytes).digest("hex")}.${type.ext}`;
}

export async function readRepoImage(token: string | undefined, repo: RepoRef, scope: "private" | "public", name: string): Promise<Buffer | null> {
  imagePath(scope, repo, name);
  const client = new Octokit(token ? { auth: token } : {});
  try {
    const response = await client.repos.getContent({ owner: repo.owner, repo: repo.name, path: `data/${scope === "private" ? "images" : "shared-images"}/${name}`, ref: repo.branch });
    const file = response.data;
    if (Array.isArray(file) || file.type !== "file") return null;
    const content = file.content || (await client.git.getBlob({ owner: repo.owner, repo: repo.name, file_sha: file.sha })).data.content;
    if (!content) return null;
    const bytes = Buffer.from(content.replace(/\s/g, ""), "base64");
    return bytes.length <= MAX_IMAGE_BYTES && imageName(bytes) === name ? bytes : null;
  } catch (error: any) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function saveRepoImage(token: string, repo: RepoRef, scope: "private" | "public", bytes: Buffer): Promise<string> {
  const name = imageName(bytes);
  const client = new Octokit({ auth: token });
  const path = `data/${scope === "private" ? "images" : "shared-images"}/${name}`;
  try {
    await client.repos.getContent({ owner: repo.owner, repo: repo.name, path, ref: repo.branch });
  } catch (error: any) {
    if (error.status !== 404) throw error;
    await client.repos.createOrUpdateFileContents({ owner: repo.owner, repo: repo.name, path, branch: repo.branch,
      message: `Add recipe image: ${name}`, content: bytes.toString("base64") });
  }
  return imagePath(scope, repo, name);
}

export async function resolveRecipeImage(input: unknown, upload: unknown, token: string, repo: RepoRef): Promise<string | undefined> {
  if (upload !== undefined && upload !== null && upload !== "") return saveRepoImage(token, repo, "private", decodeImageUpload(upload));
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input !== "string") throw new ImageInputError("Image must be a URL or local image path");
  const path = parseImagePath(input);
  if (path) {
    if (path.scope !== "private" || path.owner !== repo.owner || path.repo !== repo.name) throw new ImageInputError("Image must belong to your selected recipe repo");
    if (!await readRepoImage(token, repo, "private", path.name)) throw new ImageInputError("Local image was not found");
    return input;
  }
  const { normalizeRecipeUrl } = await import("./normalize");
  const url = normalizeRecipeUrl(input, "image");
  if (!url || !url.startsWith("https://")) throw new ImageInputError("Image must be an HTTPS URL");
  return saveRepoImage(token, repo, "private", await downloadImage(url));
}

export function imageMime(name: string): string {
  return name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : name.endsWith(".webp") ? "image/webp" : "image/gif";
}
