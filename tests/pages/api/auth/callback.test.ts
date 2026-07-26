import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { encryptSession, decryptSession, SESSION_COOKIE, OAUTH_STATE_COOKIE } from "../../../../src/lib/session";

function fakeContext(opts: {
  code?: string;
  state?: string;
  cookieState?: string;
  existingSessionCookie?: string;
}) {
  const url = new URL("http://localhost/api/auth/callback");
  if (opts.code) url.searchParams.set("code", opts.code);
  if (opts.state) url.searchParams.set("state", opts.state);

  const cookieStore = new Map<string, string>();
  if (opts.cookieState) cookieStore.set(OAUTH_STATE_COOKIE, opts.cookieState);
  if (opts.existingSessionCookie) cookieStore.set(SESSION_COOKIE, opts.existingSessionCookie);

  const setCalls: Array<[string, string]> = [];
  return {
    context: {
      url,
      cookies: {
        get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
        set: (name: string, value: string) => setCalls.push([name, value]),
        delete: vi.fn(),
      },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    },
    setCalls,
  };
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_CLIENT_ID", "client-abc");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("SESSION_SECRET", "test-secret-value");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("redirects to login with an error when state does not match", async () => {
    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context } = fakeContext({ code: "abc", state: "wrong", cookieState: "right" });
    const response = await GET(context as any);
    expect(response.headers.get("Location")).toBe("/api/auth/login?error=state_mismatch");
  });

  it("redirects to login with an error when the token exchange fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 }))
    );
    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context } = fakeContext({ code: "abc", state: "right", cookieState: "right" });
    const response = await GET(context as any);
    expect(response.headers.get("Location")).toBe("/api/auth/login?error=token_exchange_failed");
  });

  it("redirects to login with an error when the token exchange fetch rejects (network failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("network error"))
    );
    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context } = fakeContext({ code: "abc", state: "right", cookieState: "right" });
    const response = await GET(context as any);
    expect(response.headers.get("Location")).toBe("/api/auth/login?error=token_exchange_failed");
  });

  it("on success, stores a session cookie and redirects to /settings when no repo is chosen yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gho_new" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: "rob" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context, setCalls } = fakeContext({ code: "abc", state: "right", cookieState: "right" });
    const response = await GET(context as any);

    expect(response.headers.get("Location")).toBe("/settings");
    expect(setCalls).toHaveLength(1);
    const [cookieName, cookieValue] = setCalls[0];
    expect(cookieName).toBe(SESSION_COOKIE);
    expect(decryptSession(cookieValue, "test-secret-value")).toEqual({
      githubLogin: "rob",
      accessToken: "gho_new",
      repo: null,
    });
  });

  it("carries forward a previously-chosen repo across re-login and redirects to /", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gho_new" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: "rob" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const previousCookie = encryptSession(
      { githubLogin: "rob", accessToken: "gho_old", repo: { owner: "rob", name: "recipes", branch: "main" } },
      "test-secret-value"
    );

    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context, setCalls } = fakeContext({
      code: "abc",
      state: "right",
      cookieState: "right",
      existingSessionCookie: previousCookie,
    });
    const response = await GET(context as any);

    expect(response.headers.get("Location")).toBe("/");
    const [, cookieValue] = setCalls[0];
    expect(decryptSession(cookieValue, "test-secret-value")).toEqual({
      githubLogin: "rob",
      accessToken: "gho_new",
      repo: { owner: "rob", name: "recipes", branch: "main" },
    });
  });
});
