import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import { extractJsonLdRecipe } from "./jsonld";
import { extractFallbackRecipe } from "./fallback";
import type { Recipe } from "../recipe";

export interface ImportResult {
  recipe: Omit<Recipe, "slug" | "createdAt" | "updatedAt">;
  warning?: string;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
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

function assertPublicAddress(address: string): void {
  const family = isIP(address);
  if (!family || (family === 4 ? blocked.check(address, "ipv4") :
    !globalV6.check(address, "ipv6") || blocked.check(address, "ipv6"))) {
    throw new Error("Refusing to fetch private/internal address");
  }
}

function assertSafeUrl(url: string): URL {
  if (url.length > 2048) throw new Error("URL is too long");
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}" — only http(s) URLs can be imported`);
  }
  if (parsed.username || parsed.password) throw new Error("URL credentials are not allowed");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Refusing to fetch private/internal address");
  }
  if (isIP(hostname)) assertPublicAddress(hostname);
  return parsed;
}

async function fetchPage(url: URL, signal: AbortSignal): Promise<{ html?: string; redirect?: URL }> {
  signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await new Promise<LookupAddress[]>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      lookup(hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  signal.throwIfAborted();
  if (!addresses.length) throw new Error("Hostname has no addresses");
  addresses.forEach(({ address }) => assertPublicAddress(address));
  // Pin the connection to validated DNS results; never resolve again at connect time.
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      agent: false,
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (recipe-importer)", "Accept-Encoding": "identity" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      },
    }, (response) => {
      response.on("error", reject);
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        try {
          if (!response.headers.location) throw new Error("Redirect has no destination");
          resolve({ redirect: assertSafeUrl(new URL(response.headers.location, url).href) });
        } catch (error) { reject(error); }
        return;
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        reject(new Error(`${url} responded with status ${status}`));
        return;
      }
      if (Number(response.headers["content-length"]) > MAX_RESPONSE_BYTES) {
        response.destroy();
        reject(new Error("Response exceeds the maximum allowed size"));
        return;
      }
      const encoding = response.headers["content-encoding"]?.toLowerCase();
      const decoder = encoding === "gzip" ? createGunzip() : encoding === "deflate" ? createInflate() :
        encoding === "br" ? createBrotliDecompress() : undefined;
      if (encoding && encoding !== "identity" && !decoder) {
        response.destroy();
        reject(new Error("Server returned unsupported compressed content"));
        return;
      }
      const body = decoder ?? response;
      if (decoder) {
        decoder.on("error", (error) => { response.destroy(); reject(error); });
        response.on("error", () => decoder.destroy());
        let wireBytes = 0;
        response.on("data", (chunk: Buffer) => {
          wireBytes += chunk.length;
          if (wireBytes > MAX_RESPONSE_BYTES) {
            response.destroy();
            decoder.destroy();
            reject(new Error("Response exceeds the maximum allowed size"));
          }
        });
        response.pipe(decoder);
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      body.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          response.destroy();
          decoder?.destroy();
          reject(new Error("Response exceeds the maximum allowed size"));
          return;
        }
        chunks.push(chunk);
      });
      body.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

export async function extractRecipeFromUrl(url: string): Promise<ImportResult> {
  let current = assertSafeUrl(url);
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let html = "";
  for (let redirects = 0; ; redirects++) {
    const result = await fetchPage(current, signal);
    if (!result.redirect) { html = result.html ?? ""; break; }
    if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects");
    current = result.redirect;
  }
  const jsonLd = extractJsonLdRecipe(html);
  if (jsonLd) return { recipe: { ...jsonLd, sourceUrl: url } };
  const fallback = extractFallbackRecipe(html);
  return {
    recipe: { ...fallback, sourceUrl: url },
    warning: "No structured recipe data found on this page. Fields were extracted heuristically — please review carefully before saving.",
  };
}
