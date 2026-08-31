import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";

/**
 * Asset download: owner-scoped through pass to project to user. A asset id
 * buys nothing without the session, exactly like files.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await context.params;
  const [asset] = await db
    .select({ asset: schema.assets })
    .from(schema.assets)
    .innerJoin(schema.passes, eq(schema.passes.id, schema.assets.passId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.passes.projectId))
    .where(
      and(
        eq(schema.assets.id, id),
        eq(schema.projects.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!asset) {
    return new Response("not found", { status: 404 });
  }
  try {
    const blob = await storage.get(asset.asset.storageKey);
    return new Response(new Uint8Array(blob.bytes), {
      headers: {
        "content-type": asset.asset.mime,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("storage unavailable", { status: 503 });
  }
}
