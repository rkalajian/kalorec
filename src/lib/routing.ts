import type { Session } from "./session";

export type RouteDecision = { redirect: string } | { proceed: true };

export function decideRoute(session: Session | null, pathname: string): RouteDecision {
  if (!session) return { redirect: "/api/auth/login" };
  const isSettingsPath = pathname === "/settings" || pathname.startsWith("/api/settings");
  if (!session.repo && !isSettingsPath) return { redirect: "/settings" };
  return { proceed: true };
}
