import type { ImageModelV4, ImageModelV4CallOptions } from "@ai-sdk/provider";
import sharp from "sharp";

/**
 * Atelier Sketchpad: the built-in mock image model behind the zero-key demo
 * guarantee for the studio. It implements the AI SDK image-model interface
 * (v4) and renders a deterministic abstract composition from the prompt and
 * seed: hash-derived palette and geometry, rasterized to PNG through sharp,
 * watermarked DEMO so mock output can never masquerade as a real generation.
 * The same prompt and seed always produce identical bytes.
 */
export function createMockImageModel(modelId = "atelier-sketchpad"): ImageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "atelier",
    modelId,
    maxImagesPerCall: 1,

    async doGenerate(
      options: ImageModelV4CallOptions,
    ): Promise<Awaited<ReturnType<ImageModelV4["doGenerate"]>>> {
      const prompt = options.prompt ?? "";
      const seed = options.seed ?? 0;
      const [sizeWidth, sizeHeight] = (options.size ?? "1024x1024").split("x").map(Number);
      const width = Number.isFinite(sizeWidth) ? sizeWidth : 1024;
      const height = Number.isFinite(sizeHeight) ? sizeHeight : 1024;
      const png = await renderSketch(prompt, seed, width, height);
      return {
        images: [png],
        response: { timestamp: new Date(), modelId: "atelier-sketchpad", headers: {} },
        warnings: [],
        usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: undefined, totalTokens: undefined },
        providerMetadata: { atelier: { images: [{ demo: true, seed, prompt: prompt.slice(0, 120) }] } },
      };
    },
  };
}

/** Deterministic art: palette, composition, and labels all derive from the hash. */
async function renderSketch(prompt: string, seed: number, width: number, height: number): Promise<Uint8Array> {
  const h = hash(`${prompt}|${seed}`);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 80)) % 360;
  const hue3 = (hue + 200 + ((h >> 4) % 60)) % 360;

  const shapes: string[] = [];
  const count = 5 + (h % 6);
  for (let i = 0; i < count; i++) {
    const hi = hash(`${prompt}|${seed}|${i}`);
    const r = 40 + (hi % Math.floor(Math.min(width, height) / 5));
    const cx = (hi >> 7) % width;
    const cy = (hi >> 13) % height;
    const fill = [hue, hue2, hue3][i % 3];
    const opacity = 0.25 + ((hi >> 3) % 40) / 100;
    if (i % 3 === 2) {
      // A rotated bar for compositional variety.
      const w = r * 2;
      shapes.push(
        `<rect x="${cx - r}" y="${cy - r / 4}" width="${w}" height="${r / 2}" rx="${r / 8}" fill="hsl(${fill} 70% 60%)" opacity="${opacity}" transform="rotate(${hi % 180} ${cx} ${cy})"/>`,
      );
    } else {
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${fill} 70% 62%)" opacity="${opacity}"/>`);
    }
  }

  const label = escapeXml(prompt.trim().slice(0, 64) || "untitled");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 45% 16%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 40% 9%)"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="hsl(${hue3} 60% 50%)" opacity="0.08"/>
  ${shapes.join("\n  ")}
  <text x="24" y="${height - 44}" font-family="monospace" font-size="22" fill="hsl(${hue} 30% 88%)" opacity="0.85">${label}</text>
  <text x="24" y="${height - 16}" font-family="monospace" font-size="16" fill="hsl(${hue} 30% 70%)">DEMO sketchpad seed ${seed}</text>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Uint8Array(png);
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
