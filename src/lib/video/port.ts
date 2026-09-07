/**
 * The video provider port. The AI SDK has no video primitive, so providers
 * plug in behind these two methods; the job rows in Postgres carry state and
 * the client polls, which is honest about serverless execution.
 */
export type VideoSubmitInput = {
  prompt: string;
  seconds: number;
  firstFrame?: Uint8Array;
  modelId: string;
};

export type VideoSubmitResult = {
  externalId: string;
};

export type VideoPollResult = {
  status: "running" | "completed" | "failed";
  video?: Uint8Array;
  usageSeconds?: number;
  error?: string;
};

export interface VideoProvider {
  readonly name: string;
  submit(input: VideoSubmitInput): Promise<VideoSubmitResult>;
  poll(externalId: string): Promise<VideoPollResult>;
}
