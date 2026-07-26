import { describe, it, expect, vi, afterEach } from "vitest";
import { OAUTH_STATE_COOKIE } from "../../../../src/lib/session";

describe("GET /api/auth/login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("redirects to GitHub's authorize URL and sets a matching state cookie", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "client-abc");
    const { GET } = await import("../../../../src/pages/api/auth/login");

    const setCookie = vi.fn();
    const redirect = vi.fn((location: string) => new Response(null, { status: 302, headers: { Location: location } }));

    const response = await GET({ cookies: { set: setCookie }, redirect } as any);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(location).toContain("client_id=client-abc");
    expect(location).toContain("scope=repo");

    expect(setCookie).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue] = setCookie.mock.calls[0];
    expect(cookieName).toBe(OAUTH_STATE_COOKIE);
    expect(location).toContain(`state=${cookieValue}`);
  });
});
