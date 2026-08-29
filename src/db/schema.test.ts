import { describe, expect, test } from "bun:test";
import { providers, modalities } from "./schema";

describe("the schema's registry foundations", () => {
  test("the provider enum includes the three real providers plus mock for demo mode", () => {
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("google");
    expect(providers).toContain("mock");
  });

  test("the modality enum covers text, image, video, and embedding", () => {
    expect(modalities).toEqual(["text", "image", "video", "embedding"]);
  });
});
