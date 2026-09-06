import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";

/** Export download: owner-scoped, streamed from storage with its format. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await context.params;
  const [row] = await db
    .select({ export: schema.exports })
    .from(schema.exports)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.exports.projectId))
    .where(and(eq(schema.exports.id, id), eq(schema.projects.userId, session.user.id)))
    .limit(1);
  if (!row) {
    return new Response("not found", { status: 404 });
  }
  const blob = await storage.get(row.export.storageKey).catch(() => null);
  if (!blob) {
    return new Response("storage unavailable", { status: 503 });
  }
  const mime = row.export.format === "jpeg" ? "image/jpeg" : `image/${row.export.format}`;
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      "content-type": mime,
      "content-disposition": `attachment; filename="atelier-export.${row.export.format}"`,
      "cache-control": "private, no-store",
    },
  });
}
