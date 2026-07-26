import { describe, it, expect, vi } from "vitest";
import { POST } from "../../../../src/pages/api/auth/logout";
import { SESSION_COOKIE } from "../../../../src/lib/session";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and redirects to the logged-out page (not straight back into GitHub auth)", async () => {
    const del = vi.fn();
    const response = await POST({
      cookies: { delete: del },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);

    expect(del).toHaveBeenCalledWith(SESSION_COOKIE, { path: "/" });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/logged-out");
  });
});
