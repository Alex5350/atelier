import { describe, expect, test } from "bun:test";
import { streamText } from "ai";
import { createMockLanguageModel } from "./mock-model";

/**
 * The mock is not a stub in tests only: it is the product's zero-key demo
 * provider, so its contract with the AI SDK is pinned here through the real
 * streamText entrypoint the chat route will use.
 */
describe("Atelier Muse, the built-in demo model", () => {
  test("streams a complete reply through streamText with real usage", async () => {
    const result = streamText({
      model: createMockLanguageModel(),
      prompt: "describe the warm studio light",
    });

    const text = await result.text;
    expect(text.length).toBeGreaterThan(40);
    expect(text).toContain("describe the warm studio light");

    const usage = await result.usage;
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  test("is deterministic: the same prompt streams the same reply", async () => {
    const run = async () => {
      const result = streamText({
        model: createMockLanguageModel(),
        prompt: "same words, same answer",
      });
      return result.text;
    };
    expect(await run()).toBe(await run());
  });

  test("finishes with a stop reason", async () => {
    const result = streamText({ model: createMockLanguageModel(), prompt: "finish cleanly" });
    const finish = await result.finishReason;
    expect(finish).toBe("stop");
  });
});
