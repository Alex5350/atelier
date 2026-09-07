import "server-only";
import type { VideoProvider } from "./port";
import { MockVideoProvider } from "./mock";
import { SoraProvider, VeoProvider } from "./adapters";
import type { ProviderId } from "@/lib/models/registry";

/**
 * Video provider resolution from the registry row: the mock reel needs no
 * key; Sora and Veo construct only when their provider key is present, and a
 * missing key is a typed refusal, never a silent swap.
 */
export class VideoRegistryError extends Error {
  constructor(
    public readonly code: "needs-key" | "wrong-modality",
    message: string,
  ) {
    super(message);
    this.name = "VideoRegistryError";
  }
}

const singletonMock = new MockVideoProvider();

export function resolveVideoProvider(
  provider: ProviderId,
  modelName: string,
  env: Record<string, string | undefined>,
): VideoProvider {
  if (provider === "mock") {
    return singletonMock;
  }
  if (provider === "openai") {
    const key = env.OPENAI_API_KEY;
    if (!key) {
      throw new VideoRegistryError("needs-key", "OpenAI video needs OPENAI_API_KEY to be set");
    }
    return new SoraProvider(key);
  }
  if (provider === "google") {
    const key = env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) {
      throw new VideoRegistryError("needs-key", "Google video needs GOOGLE_GENERATIVE_AI_API_KEY to be set");
    }
    return new VeoProvider(key);
  }
  throw new VideoRegistryError("wrong-modality", `${provider} has no video support`);
}
