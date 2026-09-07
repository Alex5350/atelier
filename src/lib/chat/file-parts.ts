import type { ModelMessage, UIMessage } from "ai";

/**
 * Model-message post-processing for locally stored files: the UI references
 * attachments by their in-app URL (/api/files/<id>) so history rows stay small
 * and revocable, but a real provider cannot fetch our localhost. Before the
 * prompt reaches a provider, local file parts are replaced with inline base64
 * data carrying the actual bytes. The mock provider ignores file parts, so
 * demo mode is unaffected either way.
 */
export type FileLoader = (id: string) => Promise<{ mime: string; bytes: Uint8Array } | null>;

export async function inlineLocalFileParts(
  messages: ModelMessage[],
  load: FileLoader,
): Promise<ModelMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user" || !Array.isArray(message.content)) {
        return message;
      }
      const content = await Promise.all(
        message.content.map(async (part) => {
          if (part.type !== "file" || !isUrlFileData(part.data)) {
            return part;
          }
          const id = localFileId(urlToString(part.data.url));
          if (!id) {
            return part;
          }
          const file = await load(id);
          if (!file) {
            return part;
          }
          return {
            ...part,
            mediaType: file.mime,
            data: {
              type: "data" as const,
              data: Buffer.from(file.bytes).toString("base64"),
            },
          };
        }),
      );
      return { ...message, content } as ModelMessage;
    }),
  );
}

/**
 * History and the UI keep file URLs relative (/api/files/<id>: small rows,
 * host-independent); the AI SDK validates url-shaped file data with the URL
 * constructor, which throws on a relative path. This rewrites relative file
 * part URLs to absolute for model conversion only; persisted history keeps
 * the relative form.
 */
export function absolutizeLocalFileUrls(messages: UIMessage[], origin: string): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "file" && typeof part.url === "string" && part.url.startsWith("/")
        ? { ...part, url: origin + part.url }
        : part,
    ),
  }));
}

/**
 * Narrows the model file part's loose data union to the url shape. The url
 * may arrive as a string or already wrapped in a URL instance: the AI SDK's
 * message conversion validates url file data by constructing URL objects,
 * and those instances are what reach the provider boundary.
 */
function isUrlFileData(
  data: unknown,
): data is { type: "url"; url: string | URL } {
  const url = (data as { url?: unknown } | null)?.url;
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "url" &&
    (typeof url === "string" || url instanceof URL)
  );
}

function urlToString(url: string | URL): string {
  return url instanceof URL ? url.href : url;
}

/** Recognizes this app's own file URLs and returns the id, or null. */
export function localFileId(media: string): string | null {
  const match = /(?:^|^[a-z]+:\/\/[^/]+)\/api\/files\/([0-9a-f-]{36})$/.exec(media);
  return match ? match[1] : null;
}
