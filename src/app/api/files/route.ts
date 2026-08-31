import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { extractText, kindFor, MAX_UPLOAD_BYTES } from "@/lib/files/extract";
import { storage } from "@/lib/storage";

/**
 * File upload: multipart in, storage blob plus a files row out, with text
 * extracted for documents at upload time (extraction happens once, not per
 * chat turn). Images return a URL the UI can display immediately.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) {
    return Response.json({ error: "file field is required" }, { status: 400 });
  }
  if (upload.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: "file-too-large", limitBytes: MAX_UPLOAD_BYTES },
      { status: 413 },
    );
  }

  const mime = upload.type || "application/octet-stream";
  const kind = kindFor(mime);
  if (!kind) {
    return Response.json(
      { error: "unsupported-type", mime, supported: ["images (png, jpeg, webp, gif)", "text (txt, md, csv)", "pdf"] },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await upload.arrayBuffer());
  const { key, sha256 } = await storage.put(bytes, mime);
  const extracted = kind === "document" ? await extractSafely(bytes, mime) : null;

  const id = crypto.randomUUID();
  await db.insert(schema.files).values({
    id,
    userId: session.user.id,
    storageKey: key,
    filename: upload.name || "untitled",
    mime,
    bytes: upload.size,
    sha256,
    kind,
    extractedText: extracted,
  });

  return Response.json({
    id,
    filename: upload.name,
    mime,
    kind,
    bytes: upload.size,
    url: `/api/files/${id}`,
    extractedCharacters: extracted?.length ?? 0,
  });
}

async function extractSafely(bytes: Uint8Array, mime: string): Promise<string | null> {
  try {
    const text = await extractText(bytes, mime);
    return text.length > 0 ? text : null;
  } catch {
    // Extraction is best effort: a corrupt or exotic file still uploads, and
    // the context builder states honestly that no text was extracted.
    return null;
  }
}
