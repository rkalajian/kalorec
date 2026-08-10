import type { Session } from "./session";

export type CopyAction =
  | { type: "login" }
  | { type: "settings" }
  | { type: "copy" };

export function resolveCopyAction(session: Session | null): CopyAction {
  if (!session) return { type: "login" };
  if (!session.repo) return { type: "settings" };
  return { type: "copy" };
}
