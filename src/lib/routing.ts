import type { Session } from "./session";

export type RouteDecision = { redirect: string } | { proceed: true };

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname === "/logged-out" ||
    pathname.startsWith("/u/") ||
    pathname === "/about" ||
    pathname === "/how-to-use"
  );
}

export function decideRoute(session: Session | null, pathname: string): RouteDecision {
  if (isPublicPath(pathname)) return { proceed: true };
  if (!session) {
    if (pathname === "/") return { proceed: true };
    return { redirect: "/api/auth/login" };
  }
  const isSettingsPath = pathname === "/settings" || pathname.startsWith("/api/settings/");
  if (!session.repo && !isSettingsPath) return { redirect: "/settings" };
  return { proceed: true };
}
