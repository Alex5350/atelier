import { extractText as pdfExtractText, getDocumentProxy } from "unpdf";

/**
 * Document text extraction for context mode. Plain text families decode
 * directly; PDFs go through the text layer (a scanned PDF with no text layer
 * yields an empty extraction, surfaced honestly as "no text layer" rather
 * than pretending). This module is server-only but pure with respect to its
 * inputs, so the truncation strategy beside it is unit-testable.
 */

export const DOCUMENT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/pdf",
]);

export const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function kindFor(mime: string): "image" | "document" | null {
  if (IMAGE_MIMES.has(mime)) {
    return "image";
  }
  if (DOCUMENT_MIMES.has(mime)) {
    return "document";
  }
  return null;
}

export async function extractText(bytes: Uint8Array, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await pdfExtractText(pdf, { mergePages: true });
    return (text ?? "").trim();
  }
  return new TextDecoder("utf-8").decode(bytes).trim();
}

/**
 * Head-plus-tail truncation for injected context: keep the opening (where
 * documents say what they are) and the ending (where conclusions live), with
 * an honest ellipsis marker in the middle and the elided size stated.
 */
export function truncateForContext(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }
  const half = Math.floor(maxCharacters / 2);
  const head = text.slice(0, half);
  const tail = text.slice(text.length - half);
  const elided = text.length - maxCharacters;
  return `${head}\n\n[... ${elided.toLocaleString()} characters elided for length ...]\n\n${tail}`;
}

/**
 * Builds the labeled context block for a turn's document attachments. Each
 * file arrives fenced and named so the model can attribute statements, and
 * files with no extractable text say so instead of vanishing.
 */
export function buildFileContextBlock(
  attachments: Array<{ filename: string; extractedText: string | null }>,
  maxCharactersPerFile: number,
): string | null {
  if (attachments.length === 0) {
    return null;
  }
  const sections = attachments.map((file) => {
    const raw = (file.extractedText ?? "").trim();
    const body =
      raw.length > 0
        ? truncateForContext(raw, maxCharactersPerFile)
        : "(no machine-readable text was extracted; this may be a scan without a text layer)";
    return `[file: ${file.filename}]\n${body}\n[/file]`;
  });
  return `The operator attached the following file(s) as context for this turn. Use them where relevant and cite which file a fact came from when you state one.\n\n${sections.join("\n\n")}`;
}
