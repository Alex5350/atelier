import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { createMockLanguageModel } from "./mock-model";
import { createMockImageModel } from "./mock-image";
import {
  availability,
  providerStatuses,
  type ModelRow,
  type ProviderId,
} from "./registry";
import type { EmbeddingModel, ImageModel } from "ai";

/**
 * Server-side model resolution: the single place a model id becomes an AI SDK
 * model instance. Resolution fails loudly with typed errors (never a silent
 * fallback to a default model), and pickers consume the same availability
 * rules so the UI never offers a model the server would refuse.
 */

export class RegistryError extends Error {
  constructor(
    public readonly code: "unknown-model" | "disabled" | "needs-key" | "wrong-modality",
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

const providers = {
  anthropic: createAnthropic(),
  openai: createOpenAI(),
  google: createGoogleGenerativeAI(),
} as const;

/** Live provider states from the real environment (server-only). */
export function liveProviderStatuses() {
  return providerStatuses({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

function factoryFor(provider: ProviderId, modelName: string): LanguageModel {
  if (provider === "mock") {
    return createMockLanguageModel(modelName);
  }
  return providers[provider](modelName) as LanguageModel;
}

/**
 * Resolves a registry row into a usable language model, throwing typed
 * RegistryErrors the route layer converts to user-facing states.
 */
export function resolveLanguageModel(row: ModelRow): LanguageModel {
  const status = availability(row, liveProviderStatuses());
  if (status.status === "disabled") {
    throw new RegistryError("disabled", `${row.displayName} is disabled`);
  }
  if (status.status === "needs-key") {
    throw new RegistryError(
      "needs-key",
      `${row.displayName} needs ${status.missingEnvVar} to be set`,
    );
  }
  if (row.modality !== "text") {
    throw new RegistryError("wrong-modality", `${row.displayName} is not a text model`);
  }
  return factoryFor(row.provider, row.modelName);
}

/** Non-throwing variant for pickers and admin surfaces. */
export function tryResolveLanguageModel(row: ModelRow): LanguageModel | null {
  try {
    return resolveLanguageModel(row);
  } catch {
    return null;
  }
}

/** Resolves an embedding-modality registry row the same way, same loud failures. */
export function resolveEmbeddingModel(row: ModelRow): EmbeddingModel {
  const status = availability(row, liveProviderStatuses());
  if (status.status === "disabled") {
    throw new RegistryError("disabled", `${row.displayName} is disabled`);
  }
  if (status.status === "needs-key") {
    throw new RegistryError(
      "needs-key",
      `${row.displayName} needs ${status.missingEnvVar} to be set`,
    );
  }
  if (row.modality !== "embedding") {
    throw new RegistryError("wrong-modality", `${row.displayName} is not an embedding model`);
  }
  if (row.provider === "mock") {
    throw new RegistryError("wrong-modality", "retrieval needs a real embedding provider");
  }
  // The factory functions expose .textEmbeddingModel on the provider instance.
  return (providers[row.provider] as unknown as { textEmbeddingModel: (id: string) => EmbeddingModel }).textEmbeddingModel(
    row.modelName,
  );
}

/** Resolves an image-modality registry row; the mock sketchpad needs no key. */
export function resolveImageModel(row: ModelRow): ImageModel {
  const status = availability(row, liveProviderStatuses());
  if (status.status === "disabled") {
    throw new RegistryError("disabled", `${row.displayName} is disabled`);
  }
  if (status.status === "needs-key") {
    throw new RegistryError(
      "needs-key",
      `${row.displayName} needs ${status.missingEnvVar} to be set`,
    );
  }
  if (row.modality !== "image") {
    throw new RegistryError("wrong-modality", `${row.displayName} is not an image model`);
  }
  if (row.provider === "mock") {
    return createMockImageModel(row.modelName);
  }
  const provider = providers[row.provider] as unknown as { image: (id: string) => ImageModel };
  return provider.image(row.modelName);
}
