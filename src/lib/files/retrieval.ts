import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { embedMany } from "ai";
import { db, schema } from "@/db";
import { chunkDocument, reciprocalRankFusion } from "./chunk";
import { liveProviderStatuses, resolveEmbeddingModel } from "@/lib/models/server";

/**
 * Server-side retrieval: chunk persistence with best-effort pgvector
 * embeddings, and hybrid search (vector cosine plus full-text, fused by
 * reciprocal rank). Without an embedding provider the vector half is simply
 * absent and the caller degrades to full-text only, stated honestly.
 */

const EMBEDDING_REGISTRY_ID = "openai/text-embedding-3-small";

export async function isEmbeddingConfigured(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, EMBEDDING_REGISTRY_ID))
    .limit(1);
  if (!row || !row.enabled) {
    return false;
  }
  return liveProviderStatuses().some((s) => s.provider === "openai" && s.configured);
}

/** Chunks and persists a document, embedding when the provider is configured. */
export async function indexDocument(
  fileId: string,
  text: string,
  userId?: string,
): Promise<number> {
  const chunks = chunkDocument(text);
  if (chunks.length === 0) {
    return 0;
  }

  let embeddings: Array<Array<number>> | null = null;
  if (await isEmbeddingConfigured()) {
    try {
      const [row] = await db
        .select()
        .from(schema.models)
        .where(eq(schema.models.id, EMBEDDING_REGISTRY_ID))
        .limit(1);
      const model = resolveEmbeddingModel({
        id: row.id,
        displayName: row.displayName,
        provider: row.provider,
        modality: row.modality,
        modelName: row.modelName,
        capabilities: (row.capabilities as string[]) ?? [],
        contextWindow: row.contextWindow,
        enabled: row.enabled,
        isMock: row.isMock,
      });
      const { embeddings: vectors, usage } = await embedMany({
        model,
        values: chunks.map((chunk) => chunk.content),
      });
      embeddings = vectors;
      if (userId) {
        const { writeUsageEvent } = await import("@/lib/usage/queries");
        await writeUsageEvent({
          userId,
          modelId: EMBEDDING_REGISTRY_ID,
          kind: "embedding",
          inputTokens: usage?.tokens ?? 0,
          outputTokens: 0,
        });
      }
    } catch {
      // Embedding is an enhancement, never a gate: FTS still covers retrieval.
      embeddings = null;
    }
  }

  await db.insert(schema.fileChunks).values(
    chunks.map((chunk, index) => ({
      id: crypto.randomUUID(),
      fileId,
      ord: chunk.ord,
      content: chunk.content,
      charCount: chunk.charCount,
      embedding: embeddings?.at(index) ?? null,
    })),
  );
  return chunks.length;
}

export type RetrievedChunk = {
  chunkId: string;
  fileId: string;
  filename: string;
  ord: number;
  content: string;
  via: Array<"vector" | "fulltext">;
};

/**
 * Hybrid search over the given files: vector cosine top-k and English
 * full-text top-k, fused. Returns up to `limit` chunks with attribution of
 * which rankings surfaced each one.
 */
export async function searchChunks(
  query: string,
  fileIds: string[],
  limit = 5,
): Promise<RetrievedChunk[]> {
  if (query.trim().length === 0 || fileIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      chunkId: schema.fileChunks.id,
      fileId: schema.fileChunks.fileId,
      ord: schema.fileChunks.ord,
      content: schema.fileChunks.content,
      embedding: schema.fileChunks.embedding,
      filename: schema.files.filename,
    })
    .from(schema.fileChunks)
    .innerJoin(schema.files, eq(schema.files.id, schema.fileChunks.fileId))
    .where(and(inArray(schema.fileChunks.fileId, fileIds)))
    .orderBy(schema.fileChunks.fileId, schema.fileChunks.ord);

  if (rows.length === 0) {
    return [];
  }

  const terms = query.trim().toLowerCase();
  const vectorIds: string[] = [];
  const ftsIds: string[] = [];
  let queryVector: Array<number> | null = null;

  const anyEmbedded = rows.some((row) => row.embedding !== null);
  if (anyEmbedded && (await isEmbeddingConfigured())) {
    try {
      const [row] = await db
        .select()
        .from(schema.models)
        .where(eq(schema.models.id, EMBEDDING_REGISTRY_ID))
        .limit(1);
      const model = resolveEmbeddingModel({
        id: row.id,
        displayName: row.displayName,
        provider: row.provider,
        modality: row.modality,
        modelName: row.modelName,
        capabilities: (row.capabilities as string[]) ?? [],
        contextWindow: row.contextWindow,
        enabled: row.enabled,
        isMock: row.isMock,
      });
      queryVector = (await embedMany({ model, values: [query] })).embeddings[0];
    } catch {
      queryVector = null;
    }
  }

  const scored = rows.map((row) => {
    let cosine = -2;
    if (queryVector && row.embedding) {
      cosine = cosineSimilarity(queryVector, row.embedding);
    }
    const fts = ftsScore(row.content, terms);
    return { row, cosine, fts };
  });

  for (const entry of scored) {
    if (entry.cosine > -2) {
      vectorIds.push(entry.row.chunkId);
    }
  }
  vectorIds.sort(
    (a, b) =>
      (scored.find((s) => s.row.chunkId === b)!.cosine ?? -2) -
      (scored.find((s) => s.row.chunkId === a)!.cosine ?? -2),
  );
  for (const entry of scored) {
    if (entry.fts > 0) {
      ftsIds.push(entry.row.chunkId);
    }
  }
  ftsIds.sort(
    (a, b) =>
      (scored.find((s) => s.row.chunkId === b)!.fts ?? 0) -
      (scored.find((s) => s.row.chunkId === a)!.fts ?? 0),
  );

  const fused = reciprocalRankFusion([vectorIds.slice(0, limit * 2), ftsIds.slice(0, limit * 2)]);
  const viaFor = (chunkId: string) => {
    const via: Array<"vector" | "fulltext"> = [];
    if (vectorIds.includes(chunkId)) {
      via.push("vector");
    }
    if (ftsIds.includes(chunkId)) {
      via.push("fulltext");
    }
    return via;
  };

  return fused
    .filter((entry) => entry.bestRank <= limit * 2)
    .slice(0, limit)
    .map((entry) => {
      const row = rows.find((r) => r.chunkId === entry.item)!;
      return {
        chunkId: row.chunkId,
        fileId: row.fileId,
        filename: row.filename,
        ord: row.ord,
        content: row.content,
        via: viaFor(entry.item),
      };
    });
}

function cosineSimilarity(a: Array<number>, b: Array<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) {
    return -1;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Full-text score: count of query term occurrences, case-insensitive. */
function ftsScore(content: string, terms: string): number {
  const haystack = content.toLowerCase();
  let score = 0;
  for (const term of terms.split(/\s+/).filter((t) => t.length > 2)) {
    let index = haystack.indexOf(term);
    while (index !== -1) {
      score += 1;
      index = haystack.indexOf(term, index + term.length);
    }
  }
  return score;
}

/** Formats retrieved chunks as a cited, numbered context section. */
export function buildRetrievalBlock(chunks: RetrievedChunk[]): string | null {
  if (chunks.length === 0) {
    return null;
  }
  const sections = chunks.map(
    (chunk, index) =>
      `[doc: ${chunk.filename}#c${chunk.ord}] (excerpt ${index + 1} of ${chunks.length})\n${chunk.content}\n[/doc]`,
  );
  return `Retrieved excerpts follow, ranked by relevance to the operator's message. When you state a fact from them, cite the excerpt inline as [doc: filename#cN].\n\n${sections.join("\n\n")}`;
}
