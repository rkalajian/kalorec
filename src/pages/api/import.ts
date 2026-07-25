import type { APIRoute } from "astro";
import { extractRecipeFromUrl } from "../../lib/extract";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  if (!body.url || typeof body.url !== "string") {
    return new Response(JSON.stringify({ error: "URL is required" }), { status: 400 });
  }

  try {
    const result = await extractRecipeFromUrl(body.url);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Could not import recipe: ${err.message}` }), { status: 422 });
  }
};
