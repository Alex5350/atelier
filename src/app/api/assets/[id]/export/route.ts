import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";
import { logActivity } from "@/lib/studio/queries";

const FORMATS = new Set(["png", "jpeg", "webp"]);

/**
 * Export converts the asset to a chosen format and records the download as an
 * export log row, never a pass or asset. The bytes land in storage exactly
 * once and the activity log ties the export to its source asset.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { format?: string };
  const format = body.format ?? "png";
  if (!FORMATS.has(format)) {
    return Response.json({ error: "unsupported-format", format }, { status: 400 });
  }

  const [row] = await db
    .select({ asset: schema.assets, projectId: schema.projects.id })
    .from(schema.assets)
    .innerJoin(schema.passes, eq(schema.passes.id, schema.assets.passId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.passes.projectId))
    .where(and(eq(schema.assets.id, id), eq(schema.projects.userId, session.user.id)))
    .limit(1);
  if (!row) {
    return Response.json({ error: "unknown-asset" }, { status: 404 });
  }

  const source = await storage.get(row.asset.storageKey);
  let converted: Buffer;
  if (format === "jpeg") {
    converted = await sharp(Buffer.from(source.bytes)).flatten({ background: "#0c0e12" }).jpeg({ quality: 92 }).toBuffer();
  } else if (format === "webp") {
    converted = await sharp(Buffer.from(source.bytes)).webp({ quality: 90 }).toBuffer();
  } else {
    converted = await sharp(Buffer.from(source.bytes)).png().toBuffer();
  }
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const { key } = await storage.put(new Uint8Array(converted), mime);

  const exportId = crypto.randomUUID();
  await db.insert(schema.exports).values({
    id: exportId,
    projectId: row.projectId,
    assetId: row.asset.id,
    format,
    storageKey: key,
    bytes: converted.length,
  });
  await logActivity(row.projectId, "export", { exportId, assetId: row.asset.id, format, bytes: converted.length });

  return Response.json({ id: exportId, format, bytes: converted.length, url: `/api/exports/${exportId}` }, { status: 201 });
}
