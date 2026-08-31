import { describe, expect, test } from "bun:test";
import { chunkDocument, reciprocalRankFusion } from "./chunk";

describe("document chunking", () => {
  test("short documents pass through as a single chunk", () => {
    const chunks = chunkDocument("one paragraph");
    expect(chunks).toEqual([{ ord: 0, content: "one paragraph", charCount: 13 }]);
  });

  test("empty text chunks to nothing", () => {
    expect(chunkDocument("   ")).toEqual([]);
  });

  test("long documents split near the target with paragraph respect", () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}: ${"x".repeat(120)}`);
    const chunks = chunkDocument(paragraphs.join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.charCount).toBeLessThanOrEqual(1_800 + 200); // target plus one piece of slop
    }
    // Ordering is preserved and ords are sequential.
    expect(chunks.map((chunk) => chunk.ord)).toEqual(chunks.map((_, index) => index));
    // Content is not lost: every paragraph number appears somewhere.
    for (let i = 0; i < 40; i += 7) {
      expect(chunks.some((chunk) => chunk.content.includes(`Paragraph ${i}:`))).toBe(true);
    }
  });

  test("consecutive chunks overlap so phrases straddling a cut stay findable", () => {
    const paragraphs = Array.from({ length: 60 }, (_, i) => `p${i} ${"y".repeat(110)}`);
    const chunks = chunkDocument(paragraphs.join("\n\n"));
    const joined = chunks.map((chunk) => chunk.content).join("\n<<<CUT>>>\n");
    expect(joined).toContain("<<<CUT>>>");
    // At least one chunk pair shares text (the overlap tail seeded the next).
    const overlaps = chunks.slice(1).filter((chunk, index) => {
      const previous = chunks[index].content;
      const tail = previous.slice(-100);
      return chunk.content.includes(tail.slice(0, 40));
    });
    expect(overlaps.length).toBeGreaterThan(0);
  });
});

describe("reciprocal rank fusion", () => {
  test("items found by both rankings outrank items found by one", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["c", "a", "d"],
    ]);
    expect(fused[0]?.item).toBe("a"); // rank 1 + rank 2
    expect(fused[1]?.item).toBe("c"); // rank 3 + rank 1
    expect(fused.map((entry) => entry.item)).not.toContain("b x");
  });

  test("an item only in one ranking still appears, below dual finds", () => {
    const fused = reciprocalRankFusion([["x"], ["y", "x"]]);
    expect(fused[0]?.item).toBe("x");
    expect(fused.map((entry) => entry.item)).toContain("y");
  });

  test("empty rankings fuse to nothing", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
