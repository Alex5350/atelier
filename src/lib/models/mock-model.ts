import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";

/**
 * Atelier Muse: the built-in mock language model behind the zero-key demo
 * guarantee. It implements the AI SDK language-model interface (v4) and
 * streams deterministic canned studio narration derived from the prompt, so
 * the entire app is demonstrable with no provider keys: chats stream, usage
 * lands in the ledger at a registered zero price, and every surface that
 * shows model output labels it DEMO.
 *
 * Deterministic by design: the same prompt always streams the same reply,
 * which keeps demo-mode tests and screenshots stable.
 */
export function createMockLanguageModel(modelId = "atelier-muse"): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "atelier",
    modelId,
    supportedUrls: {},

    async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      const reply = museReply(options);
      const inputTokens = countTokens(options.prompt);
      const outputTokens = countTokens(reply);

      let sent = 0;
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "0" });
          for (const chunk of chunkText(reply)) {
            // Small delay between chunks so streaming is observable in the UI
            // during demos; short enough that tests stay fast.
            await sleep(12);
            controller.enqueue({ type: "text-delta", id: "0", delta: chunk });
            sent += chunk.length;
          }
          controller.enqueue({ type: "text-end", id: "0" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "demo_complete" },
            usage: {
              inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
            },
            providerMetadata: { atelier: { demo: true, characters: sent } },
          });
          controller.close();
        },
      });

      return { stream };
    },

    async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      const reply = museReply(options);
      const inputTokens = countTokens(options.prompt);
      const outputTokens = countTokens(reply);
      const content: LanguageModelV4Content[] = [{ type: "text", text: reply }];
      return {
        content,
        warnings: [],
        finishReason: { unified: "stop", raw: "demo_complete" },
        usage: {
          inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
        },
        providerMetadata: { atelier: { demo: true } },
      };
    },
  };
}

/** Extracts the prompt text for the deterministic seed. */
function promptText(options: LanguageModelV4CallOptions): string {
  return options.prompt
    .map((message) => {
      const body = message.content;
      if (typeof body === "string") {
        return body;
      }
      return body
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join(" ");
    })
    .join("\n");
}

/** Deterministic pick from the narrator's card of replies. */
function museReply(options: LanguageModelV4CallOptions): string {
  const prompt = promptText(options).trim() || "the empty studio";
  const seed = hash(prompt);
  const subject = prompt.length > 90 ? prompt.slice(0, 90) + "..." : prompt;
  const openings = [
    "Here in the demo studio, no keys were harmed",
    "The demo narrator clears its throat",
    "Mock mode, real streaming",
  ];
  const bodies = [
    "I can only echo shapes today: your words arrive, and the pipeline proves it can carry them back. Wire a provider key and the same surface speaks with a frontier model.",
    "Everything you see here runs on the built-in mock provider. The registry resolved it, the stream is real, and the usage ledger recorded this exchange at a registered zero price.",
    "This reply is deterministic: same prompt, same words, every time. That is deliberate, so demonstrations and tests never surprise you.",
  ];
  return `**${openings[seed % openings.length]}.** ${bodies[(seed >> 3) % bodies.length]}\n\nYour prompt was: _${subject}_`;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function chunkText(text: string): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 3) {
    chunks.push(words.slice(i, i + 3).join(" ") + (i + 3 < words.length ? " " : ""));
  }
  return chunks;
}

function countTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  // A rough, stable token approximation (~4 characters per token); exactness
  // does not matter because mock prices are zero, but the shape must be real.
  return Math.max(1, Math.ceil(text.length / 4));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
