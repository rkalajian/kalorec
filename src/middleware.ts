import { defineMiddleware } from "astro:middleware";
import { decryptSession, requireEnv, SESSION_COOKIE } from "./lib/session";
import { decideRoute } from "./lib/routing";

export const onRequest = defineMiddleware((context, next) => {
  const cookie = context.cookies.get(SESSION_COOKIE)?.value;
  const session = cookie
    ? decryptSession(cookie, requireEnv("SESSION_SECRET", import.meta.env.SESSION_SECRET))
    : null;

  const decision = decideRoute(session, context.url.pathname);
  if ("redirect" in decision) {
    return context.redirect(decision.redirect);
  }

  context.locals.session = session!;
  return next();
});
