import type { APIRoute } from "astro";
import { extractRecipeFromUrl } from "../../lib/extract";

export const POST: APIRoute = async ({ request }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.url !== "string" || !body.url.trim()) {
    return new Response(JSON.stringify({ error: "URL is required" }), { status: 400 });
  }
  if (body.url.length > 2048) {
    return new Response(JSON.stringify({ error: "URL is too long" }), { status: 400 });
  }

  try {
    const result = await extractRecipeFromUrl(body.url);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Could not import recipe: ${err.message}` }), { status: 422 });
  }
};
