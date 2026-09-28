import type { APIRoute } from "astro";
import { Octokit } from "@octokit/rest";
import { imageMime, imagePath, readRepoImage } from "../../../../../../lib/images";

export const GET: APIRoute = async ({ params, locals }) => {
  const { scope, owner, repo, name } = params;
  if ((scope !== "private" && scope !== "public") || !owner || !repo || !name) return new Response(null, { status: 404 });
  let selected;
  let token: string | undefined;
  if (scope === "private") {
    const session = locals.session;
    if (!session?.repo || session.repo.owner !== owner || session.repo.name !== repo || session.repo.private !== true) return new Response(null, { status: 404 });
    selected = session.repo;
    token = session.accessToken;
  } else {
    try {
      const response = await new Octokit().repos.get({ owner, repo });
      if (response.data.private) return new Response(null, { status: 404 });
      selected = { owner, name: repo, branch: response.data.default_branch, private: false };
    } catch { return new Response(null, { status: 404 }); }
  }
  try {
    imagePath(scope, selected, name);
    const bytes = await readRepoImage(token, selected, scope, name);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": imageMime(name), "X-Content-Type-Options": "nosniff",
      "Cache-Control": scope === "public" ? "public, max-age=31536000, immutable" : "private, max-age=3600",
    } });
  } catch { return new Response(null, { status: 404 }); }
};
