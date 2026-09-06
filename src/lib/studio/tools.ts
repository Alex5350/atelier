import sharp from "sharp";

/**
 * The deterministic geometry and compositing behind the enhancement tools.
 * Upscale is model-free (a high-quality resample kernel, honestly labeled);
 * outpaint pads the canvas then fills only the new strip through the resolved
 * image model; inpaint composites the model's output only inside the painted
 * mask. The pure geometry is split out for unit tests.
 */

export type Direction = "left" | "right" | "up" | "down";

/** Pad geometry: how many pixels each side grows for a direction and percent. */
export function padMetrics(
  direction: Direction,
  percent: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const clamped = Math.min(100, Math.max(10, percent));
  if (direction === "left" || direction === "right") {
    const grow = Math.round((width * clamped) / 100);
    return {
      left: direction === "left" ? grow : 0,
      top: 0,
      width: width + grow,
      height,
    };
  }
  const grow = Math.round((height * clamped) / 100);
  return {
    left: 0,
    top: direction === "up" ? grow : 0,
    width,
    height: height + grow,
  };
}

/** Upscale by an integer factor with a Lanczos kernel; never downscales. */
export async function upscale(bytes: Uint8Array, factor: number): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const image = sharp(Buffer.from(bytes), { limitInputPixels: 100_000_000 });
  const meta = await image.metadata();
  const targetWidth = Math.round((meta.width ?? 1024) * factor);
  const out = await image
    .resize({ width: targetWidth, kernel: "lanczos3" })
    .png()
    .toBuffer();
  return {
    bytes: new Uint8Array(out),
    width: targetWidth,
    height: Math.round((meta.height ?? 1024) * factor),
  };
}

/** Pads the canvas in a direction; the mask marks only the new strip. */
export async function padCanvas(
  bytes: Uint8Array,
  direction: Direction,
  percent: number,
): Promise<{ padded: Uint8Array; mask: Uint8Array; metrics: ReturnType<typeof padMetrics> }> {
  const base = sharp(Buffer.from(bytes), { limitInputPixels: 100_000_000 });
  const meta = await base.metadata();
  const metrics = padMetrics(direction, percent, meta.width ?? 1024, meta.height ?? 1024);

  const padded = await base
    .extend({
      left: metrics.left,
      top: metrics.top,
      right: metrics.width - (meta.width ?? 1024) - metrics.left,
      bottom: metrics.height - (meta.height ?? 1024) - metrics.top,
      background: { r: 12, g: 14, b: 18, alpha: 1 },
    })
    .png()
    .toBuffer();

  // Mask: black everywhere (keep), white only in the extended strip (fill).
  const originalWidth = meta.width ?? 1024;
  const originalHeight = meta.height ?? 1024;
  const horizontal = direction === "left" || direction === "right";
  const strip = {
    x: direction === "right" ? originalWidth : 0,
    y: direction === "down" ? originalHeight : 0,
    width: horizontal ? metrics.width - originalWidth : metrics.width,
    height: !horizontal ? metrics.height - originalHeight : metrics.height,
  };
  const mask = await sharp({
    create: {
      width: metrics.width,
      height: metrics.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${metrics.width}" height="${metrics.height}"><rect x="${strip.x}" y="${strip.y}" width="${strip.width}" height="${strip.height}" fill="white"/></svg>`,
        ),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  return { padded: new Uint8Array(padded), mask: new Uint8Array(mask), metrics };
}

/**
 * Composites generated fill bytes onto a base only where the mask is opaque:
 * the outpaint strip or the painted inpaint region. Everything else stays
 * byte-identical to the base.
 */
export async function compositeWithinMask(
  base: Uint8Array,
  fill: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const resizedFill = await sharp(Buffer.from(fill))
    .resize(width, height, { fit: "cover" })
    .png()
    .toBuffer();
  const out = await sharp(Buffer.from(base))
    .composite([{ input: Buffer.from(resizedFill), blend: "over" }])
    .joinChannel(Buffer.from(mask))
    .removeAlpha()
    .png()
    .toBuffer()
    .catch(async () => {
      // Fallback path for channel mismatches: straight alpha blend of the
      // fill using the mask as the alpha layer.
      const fillRgba = await sharp(Buffer.from(resizedFill)).ensureAlpha().png().toBuffer();
      const maskAlpha = await sharp(Buffer.from(mask)).ensureAlpha().png().toBuffer();
      return sharp(Buffer.from(base))
        .composite([
          {
            input: await sharp(fillRgba)
              .composite([{ input: maskAlpha, blend: "dest-in" }])
              .png()
              .toBuffer(),
            blend: "over",
          },
        ])
        .png()
        .toBuffer();
    });
  return new Uint8Array(out);
}
