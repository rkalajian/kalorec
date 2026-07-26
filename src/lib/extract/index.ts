import { extractJsonLdRecipe } from "./jsonld";
import { extractFallbackRecipe } from "./fallback";
import type { Recipe } from "../recipe";

export interface ImportResult {
  recipe: Omit<Recipe, "slug" | "createdAt" | "updatedAt">;
  warning?: string;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// Basic hostname-pattern check for private/loopback/link-local ranges. Not a
// substitute for a full DNS-resolution check, but enough to block the obvious
// SSRF targets (localhost, RFC1918 ranges, link-local, IPv6 loopback/ULA).
const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
];

function assertSafeUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}" — only http(s) URLs can be imported`);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error(`Refusing to fetch private/internal address`);
  }
  return parsed;
}

export async function extractRecipeFromUrl(url: string): Promise<ImportResult> {
  const parsed = assertSafeUrl(url);
  let response: Response;
  try {
    response = await fetch(parsed, {
      headers: { "User-Agent": "Mozilla/5.0 (recipe-importer)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err: any) {
    throw new Error(`Could not reach ${url}: ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`${url} responded with status ${response.status}`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error(`Response from ${url} exceeds the maximum allowed size`);
  }
  const html = await response.text();
  const jsonLd = extractJsonLdRecipe(html);
  if (jsonLd) {
    return { recipe: { ...jsonLd, sourceUrl: url } };
  }
  const fallback = extractFallbackRecipe(html);
  return {
    recipe: { ...fallback, sourceUrl: url },
    warning:
      "No structured recipe data found on this page. Fields were extracted heuristically — please review carefully before saving.",
  };
}
