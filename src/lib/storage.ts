import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * The storage port. Development writes content-addressed blobs to a local
 * directory; production swaps in an S3-compatible implementation behind the
 * same two methods. Keys are opaque strings the database stores verbatim.
 */
export interface Storage {
  put(bytes: Uint8Array, mime: string): Promise<{ key: string; sha256: string }>;
  get(key: string): Promise<{ bytes: Buffer; mime: string }>;
}

const ROOT = process.env.ATELIER_STORAGE_DIR ?? resolve(process.cwd(), ".data", "blobs");

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
  };
  return map[mime] ?? "bin";
}

function mimeFor(key: string): string {
  const extension = key.split(".").at(-1) ?? "bin";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
  };
  return map[extension] ?? "application/octet-stream";
}

class LocalDiskStorage implements Storage {
  async put(bytes: Uint8Array, mime: string) {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const key = `${sha256.slice(0, 12)}-${crypto.randomUUID()}.${extensionFor(mime)}`;
    const target = join(ROOT, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { key, sha256 };
  }

  async get(key: string) {
    // Defense: keys are file names we minted; refuse anything path-shaped.
    if (key.includes("/") || key.includes("..")) {
      throw new Error("invalid storage key");
    }
    const bytes = await readFile(join(ROOT, key));
    return { bytes, mime: mimeFor(key) };
  }
}

export const storage: Storage = new LocalDiskStorage();
