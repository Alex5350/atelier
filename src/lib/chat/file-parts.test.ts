import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { inlineLocalFileParts, localFileId } from "./file-parts";

const VALID = "3f1d2c84-9a6b-4d2e-8f7a-1b0c5d6e7f8a";

function userMessage(part: unknown): ModelMessage {
  return { role: "user", content: [part] } as unknown as ModelMessage;
}

describe("local file id recognition", () => {
  test("recognizes this app's file URLs", () => {
    expect(localFileId(`/api/files/${VALID}`)).toBe(VALID);
  });

  test("refuses anything else, including path tricks", () => {
    expect(localFileId("/api/files/../../etc/passwd")).toBeNull();
    expect(localFileId("https://example.com/x.png")).toBeNull();
    expect(localFileId("/api/files/not-a-uuid")).toBeNull();
  });
});

describe("inlining local file parts", () => {
  test("a local url part becomes inline base64 data with its mime", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const messages = [
      userMessage({
        type: "file",
        mediaType: "image/png",
        filename: "dot.png",
        data: { type: "url", url: `/api/files/${VALID}` },
      }),
    ];
    const [processed] = await inlineLocalFileParts(messages, async (id) =>
      id === VALID ? { mime: "image/png", bytes } : null,
    );
    const part = (processed.content as Array<{ type: string; data?: { type: string; data?: string }; mediaType?: string }>)[0];
    expect(part.type).toBe("file");
    expect(part.data?.type).toBe("data");
    expect(part.data?.data).toBe(Buffer.from(bytes).toString("base64"));
    expect(part.mediaType).toBe("image/png");
  });

  test("external urls and text parts pass through untouched", async () => {
    const messages = [
      userMessage({ type: "text", text: "hi" }),
      userMessage({ type: "file", mediaType: "image/png", data: { type: "url", url: "https://cdn.example.com/a.png" } }),
    ];
    const processed = await inlineLocalFileParts(messages, async () => null);
    expect(processed[0]).toEqual(messages[0]);
    expect((processed[1].content as unknown[])[1]).toEqual(
      (messages[1].content as unknown[])[1],
    );
  });

  test("a local id the loader cannot satisfy stays as-is (fail open for display)", async () => {
    const messages = [
      userMessage({ type: "file", mediaType: "image/png", data: { type: "url", url: `/api/files/${VALID}` } }),
    ];
    const processed = await inlineLocalFileParts(messages, async () => null);
    expect(processed[0]).toEqual(messages[0]);
  });
});
