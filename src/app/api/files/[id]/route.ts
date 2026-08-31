import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";

/**
 * File download: owner-scoped (a file id buys nothing without the session),
 * streaming from the storage port with its recorded content type.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await context.params;
  const [file] = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, id), eq(schema.files.userId, session.user.id)))
    .limit(1);
  if (!file) {
    return new Response("not found", { status: 404 });
  }
  try {
    const blob = await storage.get(file.storageKey);
    return new Response(new Uint8Array(blob.bytes), {
      headers: {
        "content-type": file.mime,
        "content-length": String(blob.bytes.length),
        "cache-control": "private, max-age=3600",
        "content-disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      },
    });
  } catch {
    return new Response("storage unavailable", { status: 503 });
  }
}
