import type { APIRoute } from "astro";
import { SESSION_COOKIE } from "../../lib/session";
import {
  loadShoppingList, saveShoppingList,
  ShoppingListAccessError, ShoppingListConfigurationError,
  ShoppingListConflictError, ShoppingListValidationError,
} from "../../lib/shoppingList";

const MAX_BODY_BYTES = 900_000;
class BodyTooLargeError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function json(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function handleError(error: unknown, cookies: { delete: (key: string, options: { path: string }) => void }): Response {
  if (error instanceof ShoppingListValidationError) return json(400, { error: error.message });
  if (error instanceof ShoppingListConfigurationError) return json(409, { error: error.message });
  if (error instanceof ShoppingListAccessError) return json(403, { error: error.message });
  if (error instanceof ShoppingListConflictError) return json(409, { error: error.message });
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) {
    cookies.delete(SESSION_COOKIE, { path: "/" });
    return json(401, { error: "Session expired, please log in again" });
  }
  if (status === 403 || status === 404) return json(403, { error: "Recipe repo is unavailable or inaccessible" });
  return json(502, { error: "Could not access shopping list in recipe repo. Try again." });
}

export const GET: APIRoute = async ({ locals, cookies }) => {
  if (!locals.session?.accessToken) return json(401, { error: "Sign in to view your shopping list" });
  try {
    return json(200, await loadShoppingList(locals.session));
  } catch (error) {
    return handleError(error, cookies);
  }
};

export const PUT: APIRoute = async ({ request, locals, cookies }) => {
  if (!locals.session?.accessToken) return json(401, { error: "Sign in to save your shopping list" });
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json(413, { error: "Shopping list is too large" });
    return json(400, { error: "Invalid JSON body" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !("items" in body) || !("expectedSha" in body)) {
    return json(400, { error: "items and expectedSha are required" });
  }
  try {
    const data = body as { items: unknown; expectedSha: string | null };
    const sha = await saveShoppingList(locals.session, data.items, data.expectedSha);
    return json(200, { sha });
  } catch (error) {
    return handleError(error, cookies);
  }
};
