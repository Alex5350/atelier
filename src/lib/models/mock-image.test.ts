import { describe, expect, test } from "bun:test";
import { generateImage } from "ai";
import { createMockImageModel } from "./mock-image";

/**
 * The sketchpad is the studio's zero-key image provider; its contract with
 * the AI SDK is pinned through the real generateImage entrypoint the run
 * route uses.
 */
describe("Atelier Sketchpad, the demo image model", () => {
  test("generates a real PNG with dimensions honored", async () => {
    const { image } = await generateImage({
      model: createMockImageModel(),
      prompt: "copper sunset over the foundry",
      size: "512x384",
      seed: 7,
    });
    const bytes = image.uint8Array;
    // PNG magic number.
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(512);
    expect(view.getUint32(20)).toBe(384);
  });

  test("is deterministic: same prompt and seed, identical bytes", async () => {
    const run = () =>
      generateImage({ model: createMockImageModel(), prompt: "same words", seed: 42 }).then(
        (result) => result.image.uint8Array,
      );
    const first = await run();
    const second = await run();
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  test("a different seed changes the composition", async () => {
    const one = await generateImage({ model: createMockImageModel(), prompt: "same words", seed: 1 });
    const two = await generateImage({ model: createMockImageModel(), prompt: "same words", seed: 2 });
    expect(Buffer.from(one.image.uint8Array).equals(Buffer.from(two.image.uint8Array))).toBe(false);
  });
});
