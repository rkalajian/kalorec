import { describe, it, expect } from "vitest";
import { decideRoute, isPublicPath } from "../../src/lib/routing";
import type { Session } from "../../src/lib/session";

const sessionNoRepo: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
const sessionWithRepo: Session = {
  githubLogin: "rob",
  accessToken: "tok",
  repo: { owner: "rob", name: "recipes", branch: "main", private: false },
};

describe("isPublicPath", () => {
  it("treats the auth API and the logged-out page as public", () => {
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/callback")).toBe(true);
    expect(isPublicPath("/api/auth/logout")).toBe(true);
    expect(isPublicPath("/logged-out")).toBe(true);
  });

  it("treats everything else as gated", () => {
    expect(isPublicPath("/settings")).toBe(false);
    expect(isPublicPath("/recipes/chili")).toBe(false);
    expect(isPublicPath("/api/recipes")).toBe(false);
  });

  it("treats the about and how-to-use pages as public", () => {
    expect(isPublicPath("/about")).toBe(true);
    expect(isPublicPath("/how-to-use")).toBe(true);
  });

  it("treats public profile pages as public", () => {
    expect(isPublicPath("/u/rob/recipes")).toBe(true);
    expect(isPublicPath("/u/rob/recipes/chili")).toBe(true);
  });
});

describe("decideRoute", () => {
  it("redirects to login when there is no session, except at the root", () => {
    expect(decideRoute(null, "/settings")).toEqual({ redirect: "/api/auth/login" });
    expect(decideRoute(null, "/recipes/chili")).toEqual({ redirect: "/api/auth/login" });
  });

  it("shows the landing page at the root when there is no session", () => {
    expect(decideRoute(null, "/")).toEqual({ proceed: true });
  });

  it("proceeds on public paths even with no session (no redirect loop)", () => {
    expect(decideRoute(null, "/api/auth/login")).toEqual({ proceed: true });
    expect(decideRoute(null, "/api/auth/callback")).toEqual({ proceed: true });
    expect(decideRoute(null, "/logged-out")).toEqual({ proceed: true });
  });

  it("proceeds on public profile pages even with no session", () => {
    expect(decideRoute(null, "/u/rob/recipes")).toEqual({ proceed: true });
    expect(decideRoute(null, "/u/rob/recipes/chili")).toEqual({ proceed: true });
  });

  it("proceeds on public paths even when a repo-less session exists", () => {
    expect(decideRoute(sessionNoRepo, "/logged-out")).toEqual({ proceed: true });
    expect(decideRoute(sessionNoRepo, "/api/auth/logout")).toEqual({ proceed: true });
  });

  it("redirects to settings when the session has no repo chosen", () => {
    expect(decideRoute(sessionNoRepo, "/")).toEqual({ redirect: "/settings" });
  });

  it("still redirects a logged-in, repo-less session away from the root", () => {
    expect(decideRoute(sessionNoRepo, "/")).toEqual({ redirect: "/settings" });
  });

  it("does not redirect-loop on the settings page itself", () => {
    expect(decideRoute(sessionNoRepo, "/settings")).toEqual({ proceed: true });
  });

  it("does not redirect-loop on the settings API", () => {
    expect(decideRoute(sessionNoRepo, "/api/settings/repo")).toEqual({ proceed: true });
  });

  it("does not treat a path merely prefixed with /api/settings as the settings API", () => {
    expect(decideRoute(sessionNoRepo, "/api/settingsfoo")).toEqual({ redirect: "/settings" });
  });

  it("proceeds once a repo has been selected", () => {
    expect(decideRoute(sessionWithRepo, "/")).toEqual({ proceed: true });
    expect(decideRoute(sessionWithRepo, "/recipes/chili")).toEqual({ proceed: true });
  });
});
