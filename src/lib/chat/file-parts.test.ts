import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { absolutizeLocalFileUrls, inlineLocalFileParts, localFileId } from "./file-parts";

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

describe("absolutizing local file URLs for model conversion", () => {
  test("relative file part URLs gain the origin; history-shaped parts pass through", () => {
    const id = "2c0f2ba2-a2e4-4a9c-b69d-c3bf6a91670e";
    const messages = [
      {
        id: "m1",
        role: "user" as const,
        parts: [
          { type: "text" as const, text: "look" },
          { type: "file" as const, mediaType: "text/markdown", filename: "a.md", url: `/api/files/${id}` },
        ],
      },
    ];
    const absolutized = absolutizeLocalFileUrls(messages, "http://localhost:3000");
    expect((absolutized[0]!.parts[1] as { url: string }).url).toBe(
      `http://localhost:3000/api/files/${id}`,
    );
    // The input is not mutated: persisted history stays relative.
    expect((messages[0]!.parts[1] as { url: string }).url).toBe(`/api/files/${id}`);
  });

  test("already-absolute and non-file parts are untouched", () => {
    const messages = [
      {
        id: "m2",
        role: "user" as const,
        parts: [
          { type: "text" as const, text: "hi" },
          { type: "file" as const, mediaType: "image/png", url: "https://example.com/x.png" },
        ],
      },
    ];
    const absolutized = absolutizeLocalFileUrls(messages, "http://localhost:3000");
    expect((absolutized[0]!.parts[1] as { url: string }).url).toBe("https://example.com/x.png");
  });

  test("localFileId accepts both relative and absolute app file URLs", () => {
    const id = "9996ec9a-6094-4979-bfe6-9cd8dab553ce";
    expect(localFileId(`/api/files/${id}`)).toBe(id);
    expect(localFileId(`http://localhost:3000/api/files/${id}`)).toBe(id);
    expect(localFileId("https://elsewhere/api/files/x")).toBeNull();
  });
});

test("url file data wrapped in a URL instance still inlines", async () => {
  // The SDK's message conversion wraps validated URLs in URL instances;
  // the inliner must see through both shapes.
  const message = userMessage({
    type: "file",
    mediaType: "text/markdown",
    data: { type: "url", url: new URL(`http://localhost:3000/api/files/${VALID}`) },
  });
  const out = await inlineLocalFileParts([message], async () => ({
    mime: "text/markdown",
    bytes: new Uint8Array([104, 105]),
  }));
  const part = (out[0] as { content: Array<{ data?: { type?: string; data?: string } }> })
    .content[0]!;
  expect(part.data?.type).toBe("data");
  expect(part.data?.data).toBe("aGk=");
});
