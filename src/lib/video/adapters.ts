import "server-only";
import { fetchWithTimeout } from "./fetch-with-timeout";
import type { VideoProvider, VideoSubmitInput, VideoSubmitResult, VideoPollResult } from "./port";

/**
 * Thin provider adapters for real video APIs, written to their documented
 * long-running-job shapes. They run only when the provider key is configured;
 * without one the surface stays on the demo provider, and these classes are
 * never constructed. Both are intentionally minimal: submit, poll, download.
 */
export class SoraProvider implements VideoProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly timeoutMs = 30_000,
  ) {}

  async submit(input: VideoSubmitInput): Promise<VideoSubmitResult> {
    const body: Record<string, unknown> = {
      model: input.modelId,
      prompt: input.prompt,
      seconds: String(input.seconds),
    };
    if (input.firstFrame) {
      body.input_reference = `data:image/png;base64,${Buffer.from(input.firstFrame).toString("base64")}`;
    }
    const response = await fetchWithTimeout(
      `${this.baseUrl}/videos`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      this.timeoutMs,
    );
    if (!response.ok) {
      throw new Error(`sora submit failed: ${response.status} ${await response.text()}`);
    }
    const json = (await response.json()) as { id: string };
    return { externalId: json.id };
  }

  async poll(externalId: string): Promise<VideoPollResult> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/videos/${externalId}`,
      { headers: { authorization: `Bearer ${this.apiKey}` } },
      this.timeoutMs,
    );
    if (!response.ok) {
      return { status: "failed", error: `sora poll failed: ${response.status}` };
    }
    const json = (await response.json()) as {
      status: string;
      error?: { message?: string };
    };
    if (json.status === "completed") {
      const file = await fetchWithTimeout(
        `${this.baseUrl}/videos/${externalId}/content`,
        { headers: { authorization: `Bearer ${this.apiKey}` } },
        this.timeoutMs,
      );
      if (!file.ok) {
        return { status: "failed", error: `sora download failed: ${file.status}` };
      }
      const video = new Uint8Array(await file.arrayBuffer());
      return { status: "completed", video };
    }
    if (json.status === "failed") {
      return { status: "failed", error: json.error?.message ?? "sora job failed" };
    }
    return { status: "running" };
  }
}

export class VeoProvider implements VideoProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
    private readonly timeoutMs = 30_000,
  ) {}

  async submit(input: VideoSubmitInput): Promise<VideoSubmitResult> {
    const instances: Array<Record<string, unknown>> = [{ prompt: input.prompt }];
    if (input.firstFrame) {
      instances[0].image = {
        bytesBase64Encoded: Buffer.from(input.firstFrame).toString("base64"),
        mimeType: "image/png",
      };
    }
    const response = await fetchWithTimeout(
      `${this.baseUrl}/models/${input.modelId}:predictLongRunning?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instances,
          parameters: {
            durationSeconds: input.seconds,
            sampleCount: 1,
          },
        }),
      },
      this.timeoutMs,
    );
    if (!response.ok) {
      throw new Error(`veo submit failed: ${response.status} ${await response.text()}`);
    }
    const json = (await response.json()) as { name: string };
    return { externalId: json.name };
  }

  async poll(externalId: string): Promise<VideoPollResult> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/${externalId}?key=${this.apiKey}`,
      {},
      this.timeoutMs,
    );
    if (!response.ok) {
      return { status: "failed", error: `veo poll failed: ${response.status}` };
    }
    const json = (await response.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
    };
    if (!json.done) {
      return { status: "running" };
    }
    if (json.error) {
      return { status: "failed", error: json.error.message ?? "veo job failed" };
    }
    const uri = json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) {
      return { status: "failed", error: "veo returned no video uri" };
    }
    const file = await fetchWithTimeout(
      uri.includes("?") ? `${uri}&key=${this.apiKey}` : `${uri}?key=${this.apiKey}`,
      {},
      this.timeoutMs,
    );
    if (!file.ok) {
      return { status: "failed", error: `veo download failed: ${file.status}` };
    }
    return { status: "completed", video: new Uint8Array(await file.arrayBuffer()) };
  }
}
