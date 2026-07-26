import { describe, it, expect } from "vitest";
import { decideRoute } from "../../src/lib/routing";
import type { Session } from "../../src/lib/session";

const sessionNoRepo: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
const sessionWithRepo: Session = {
  githubLogin: "rob",
  accessToken: "tok",
  repo: { owner: "rob", name: "recipes", branch: "main" },
};

describe("decideRoute", () => {
  it("redirects to login when there is no session", () => {
    expect(decideRoute(null, "/")).toEqual({ redirect: "/api/auth/login" });
  });

  it("redirects to settings when the session has no repo chosen", () => {
    expect(decideRoute(sessionNoRepo, "/")).toEqual({ redirect: "/settings" });
  });

  it("does not redirect-loop on the settings page itself", () => {
    expect(decideRoute(sessionNoRepo, "/settings")).toEqual({ proceed: true });
  });

  it("does not redirect-loop on the settings API", () => {
    expect(decideRoute(sessionNoRepo, "/api/settings/repo")).toEqual({ proceed: true });
  });

  it("proceeds once a repo has been selected", () => {
    expect(decideRoute(sessionWithRepo, "/")).toEqual({ proceed: true });
    expect(decideRoute(sessionWithRepo, "/recipes/chili")).toEqual({ proceed: true });
  });
});
