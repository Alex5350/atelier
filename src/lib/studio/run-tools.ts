import "server-only";
import { generateImage } from "ai";
import sharp from "sharp";
import type { ImageModel } from "ai";
import { compositeWithinMask, padCanvas, upscale, type Direction } from "./tools";
import { createMockImageModel } from "@/lib/models/mock-image";

/**
 * Tool pass execution, separated from the run route's orchestration. Upscale
 * is deterministic and model-free. Outpaint pads the canvas then fills only
 * the new strip; inpaint fills only the painted mask. The fill always comes
 * from the resolved image model at the target size and lands through local
 * mask compositing (the pad-and-inpaint seam): everything outside the region
 * stays byte-identical to the base, whatever the provider.
 */
export type ToolOutcome = { bytes: Uint8Array; width: number; height: number; note: string };

export async function runUpscale(base: Uint8Array, factor: number): Promise<ToolOutcome> {
  const result = await upscale(base, factor);
  return { ...result, note: `lanczos ${factor}x (deterministic, model-free)` };
}

export async function runOutpaint(options: {
  base: Uint8Array;
  direction: Direction;
  percent: number;
  prompt: string;
  seed: number;
  model: ImageModel | null;
  isMock: boolean;
}): Promise<ToolOutcome> {
  const { padded, mask, metrics } = await padCanvas(options.base, options.direction, options.percent);

  const generated = await generateImage({
    model: options.model ?? demoFallback(),
    prompt: options.prompt || "extend the scene naturally into the new region",
    seed: options.seed,
    size: `${metrics.width}x${metrics.height}`,
  });
  const fill = generated.image.uint8Array;

  const bytes = await compositeWithinMask(padded, fill, mask, metrics.width, metrics.height);
  return { bytes, width: metrics.width, height: metrics.height, note: `outpaint ${options.direction} ${options.percent}%` };
}

export async function runInpaint(options: {
  base: Uint8Array;
  maskDataUrl: string;
  prompt: string;
  seed: number;
  model: ImageModel | null;
  isMock: boolean;
}): Promise<ToolOutcome> {
  const baseMeta = await sharp(Buffer.from(options.base)).metadata();
  const width = baseMeta.width ?? 1024;
  const height = baseMeta.height ?? 1024;

  const mask = await maskBytes(options.maskDataUrl, width, height);

  const generated = await generateImage({
    model: options.model ?? demoFallback(),
    prompt: options.prompt || "fill the masked region naturally",
    seed: options.seed,
    size: `${width}x${height}`,
  });
  const fill = generated.image.uint8Array;

  const bytes = await compositeWithinMask(options.base, fill, mask, width, height);
  return { bytes, width, height, note: "inpaint within painted mask" };
}


/** Decodes a data URL mask, resizes it to the base dimensions, grayscale. */
async function maskBytes(dataUrl: string, width: number, height: number): Promise<Uint8Array> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const buffer = Buffer.from(base64, "base64");
  const resized = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .grayscale()
    .png()
    .toBuffer();
  return new Uint8Array(resized);
}

function demoFallback() {
  return createMockImageModel();
}
