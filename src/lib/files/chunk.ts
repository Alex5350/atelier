/**
 * Document chunking for retrieval. Chunks aim for roughly 1,800 characters
 * (about 450 tokens) with 15 percent overlap, split on paragraph boundaries
 * so semantic units stay together; a document shorter than one chunk passes
 * through whole. Pure functions, unit-pinned.
 */

const TARGET_CHARS = 1_800;
const OVERLAP_RATIO = 0.15;

export type Chunk = { ord: number; content: string; charCount: number };

export function chunkDocument(text: string): Chunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }
  if (normalized.length <= TARGET_CHARS) {
    return [{ ord: 0, content: normalized, charCount: normalized.length }];
  }

  const overlap = Math.round(TARGET_CHARS * OVERLAP_RATIO);
  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      chunks.push(trimmed);
    }
    // Seed the next chunk with the tail of this one for overlap.
    current = trimmed.length > overlap ? trimmed.slice(trimmed.length - overlap) : "";
  };

  for (const paragraph of paragraphs) {
    // A single paragraph longer than the target splits on sentence ends.
    const pieces =
      paragraph.length > TARGET_CHARS ? paragraph.split(/(?<=[.!?])\s+/) : [paragraph];
    for (const piece of pieces) {
      if (current.length + piece.length + 1 > TARGET_CHARS && current.trim().length > 0) {
        pushCurrent();
      }
      current += (current.length > 0 ? " " : "") + piece;
    }
  }
  pushCurrent();

  return chunks.map((content, ord) => ({ ord, content, charCount: content.length }));
}

/**
 * Reciprocal rank fusion for hybrid retrieval: each ranking contributes
 * 1 / (k + rank) per item (k = 60, the standard constant), and ties break by
 * the better rank. Pure, so the merge rule is unit-testable.
 */
export function reciprocalRankFusion<T>(
  rankings: Array<Array<T>>,
  k = 60,
): Array<{ item: T; score: number; bestRank: number }> {
  const scores = new Map<T, { score: number; bestRank: number }>();
  for (const ranking of rankings) {
    ranking.forEach((item, index) => {
      const rank = index + 1;
      const entry = scores.get(item) ?? { score: 0, bestRank: Number.MAX_SAFE_INTEGER };
      entry.score += 1 / (k + rank);
      entry.bestRank = Math.min(entry.bestRank, rank);
      scores.set(item, entry);
    });
  }
  return [...scores.entries()]
    .map(([item, entry]) => ({ item, score: entry.score, bestRank: entry.bestRank }))
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank);
}
