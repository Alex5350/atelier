import type { ModelMessage } from "ai";

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
          const id = localFileId(part.data.url);
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

/** Narrows the model file part's loose data union to the url shape. */
function isUrlFileData(
  data: unknown,
): data is { type: "url"; url: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "url" &&
    typeof (data as { url?: unknown }).url === "string"
  );
}

/** Recognizes this app's own file URLs and returns the id, or null. */
export function localFileId(media: string): string | null {
  const match = /^\/api\/files\/([0-9a-f-]{36})$/.exec(media);
  return match ? match[1] : null;
}
