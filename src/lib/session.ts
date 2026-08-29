import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { cache } from "react";

/**
 * Server-side session guard for the app surface. Cached per request so a page
 * tree validates once, not per component. Redirects unauthenticated visitors
 * to /login (defense in depth behind the middleware cookie gate).
 */
export const requireSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  return session;
});
