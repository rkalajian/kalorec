import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  decryptSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  type Session,
} from "../../../../src/lib/session";

const mockOctokitInstance = {
  repos: {
    listForAuthenticatedUser: vi.fn(),
    get: vi.fn(),
  },
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(() => mockOctokitInstance),
}));

function formRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request("http://localhost/api/settings/repo", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("POST /api/settings/repo", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-secret-value");
    mockOctokitInstance.repos.get.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("selects a repo the user has push access to and redirects home", async () => {
    mockOctokitInstance.repos.get.mockResolvedValue({ data: { default_branch: "main", private: true, permissions: { push: true } } });
    const { POST } = await import("../../../../src/pages/api/settings/repo");

    const session: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
    const setCalls: Array<[string, string, unknown]> = [];
    const response = await POST({
      request: formRequest({ owner: "rob", name: "recipes" }),
      locals: { session },
      cookies: { set: (n: string, v: string, o?: unknown) => setCalls.push([n, v, o]) },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);

    expect(response.headers.get("Location")).toBe("/");
    expect(setCalls).toHaveLength(1);
    const [name, value, options] = setCalls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toEqual(SESSION_COOKIE_OPTIONS);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    expect(decryptSession(value, "test-secret-value")).toEqual({
      githubLogin: "rob",
      accessToken: "tok",
      repo: { owner: "rob", name: "recipes", branch: "main", private: true },
    });
  });

  it("redirects back to settings with an error when push access is denied", async () => {
    mockOctokitInstance.repos.get.mockResolvedValue({ data: { default_branch: "main", permissions: { push: false } } });
    const { POST } = await import("../../../../src/pages/api/settings/repo");

    const session: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
    const response = await POST({
      request: formRequest({ owner: "rob", name: "recipes" }),
      locals: { session },
      cookies: { set: vi.fn() },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);

    expect(response.headers.get("Location")).toBe("/settings?error=no_access");
  });

  it("returns 400 when owner or name is missing", async () => {
    const { POST } = await import("../../../../src/pages/api/settings/repo");
    const session: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
    const response = await POST({
      request: formRequest({ owner: "rob" }),
      locals: { session },
      cookies: { set: vi.fn() },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);
    expect(response.status).toBe(400);
  });
});
