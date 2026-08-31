import { describe, expect, test } from "bun:test";
import { buildFileContextBlock, kindFor, truncateForContext } from "./extract";

describe("upload kind routing", () => {
  test("images and documents map to their kinds", () => {
    expect(kindFor("image/png")).toBe("image");
    expect(kindFor("application/pdf")).toBe("document");
    expect(kindFor("text/csv")).toBe("document");
  });

  test("anything else is refused as unsupported", () => {
    expect(kindFor("application/zip")).toBeNull();
    expect(kindFor("video/mp4")).toBeNull();
  });
});

describe("head-plus-tail context truncation", () => {
  test("short text passes through untouched", () => {
    expect(truncateForContext("hello", 100)).toBe("hello");
  });

  test("long text keeps head and tail with an honest elision marker", () => {
    const text = "A".repeat(400) + "MIDDLE" + "B".repeat(400);
    const result = truncateForContext(text, 200);
    expect(result.startsWith("A".repeat(100))).toBe(true);
    expect(result.endsWith("B".repeat(100))).toBe(true);
    expect(result).toContain("characters elided");
    // 806 characters in, 200 kept: 606 elided.
    expect(result).toContain("606");
  });
});

describe("the file context block", () => {
  test("no attachments produce no block", () => {
    expect(buildFileContextBlock([], 1000)).toBeNull();
  });

  test("each file arrives fenced, named, and instructed for citation", () => {
    const block = buildFileContextBlock([{ filename: "notes.md", extractedText: "the thesis" }], 1000);
    expect(block).toContain("[file: notes.md]");
    expect(block).toContain("the thesis");
    expect(block).toContain("[/file]");
    expect(block?.startsWith("The operator attached")).toBe(true);
  });

  test("a scan with no text layer says so instead of vanishing", () => {
    const block = buildFileContextBlock([{ filename: "scan.pdf", extractedText: null }], 1000);
    expect(block).toContain("no machine-readable text");
  });
});
