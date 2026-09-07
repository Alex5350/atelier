import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { VideoProvider, VideoSubmitInput, VideoSubmitResult, VideoPollResult } from "./port";

/**
 * The zero-key demo video provider: renders a deterministic labeled clip.
 * The title card is composed as an SVG and rasterized by sharp (identical
 * toolchain to the demo image model), then ffmpeg only encodes it into a
 * real MP4 with a slow hue drift. Text stays out of ffmpeg on purpose: the
 * static linux build that ffmpeg-static ships has no drawtext filter at all
 * (the macOS build does, which is exactly the kind of machine difference a
 * provider should absorb). Every frame is watermarked DEMO so mock output
 * can never masquerade as a real generation, and the clip is an original
 * composition, not a copied sample.
 */
export class MockVideoProvider implements VideoProvider {
  readonly name = "atelier";

  private readonly jobs = new Map<string, { input: VideoSubmitInput; startedAt: number }>();

  async submit(input: VideoSubmitInput): Promise<VideoSubmitResult> {
    const externalId = crypto.randomUUID();
    this.jobs.set(externalId, { input, startedAt: Date.now() });
    return { externalId };
  }

  async poll(externalId: string): Promise<VideoPollResult> {
    const job = this.jobs.get(externalId);
    if (!job) {
      return { status: "failed", error: "unknown mock job" };
    }
    // A short, realistic-seeming render window so the polling UI demonstrates.
    const elapsed = Date.now() - job.startedAt;
    if (elapsed < 2_500) {
      return { status: "running" };
    }
    try {
      const video = await renderReel(job.input.prompt, job.input.seconds);
      this.jobs.delete(externalId);
      return { status: "completed", video, usageSeconds: job.input.seconds };
    } catch (error) {
      this.jobs.delete(externalId);
      return { status: "failed", error: error instanceof Error ? error.message : "render failed" };
    }
  }
}

async function renderReel(prompt: string, seconds: number): Promise<Uint8Array> {
  const ffmpegPath = await resolveFfmpeg();
  const hash = fnv(prompt);
  const hue = hash % 360;
  const duration = Math.min(8, Math.max(2, seconds));
  const dir = await mkdtemp(join(tmpdir(), "atelier-reel-"));

  try {
    const card = await sharp(Buffer.from(titleCardSvg(prompt, hash)))
      .png()
      .toBuffer();
    await writeFile(join(dir, "card.png"), card);

    // Only core filters below (image2 loop, hue, format): no drawtext, no
    // fonts, no build-dependent filters between us and a valid mp4.
    const stderr: string[] = [];
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(ffmpegPath, [
        "-y", "-loglevel", "error",
        "-loop", "1", "-framerate", "24", "-t", String(duration), "-i", join(dir, "card.png"),
        "-vf", "hue=h=t*8,format=yuv420p",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        join(dir, "reel.mp4"),
      ]);
      child.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
      child.on("error", reject);
      child.on("close", resolve);
    });
    if (code !== 0) {
      throw new Error(`ffmpeg exited ${code}: ${stderr.join("").trim().slice(-400)}`);
    }
    const file = await readFile(join(dir, "reel.mp4"));
    return new Uint8Array(file);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * The 640x360 title card: palette and geometry derive from the prompt hash
 * (same deterministic recipe as the demo image model), with the fixed DEMO
 * labeling layered on top.
 */
function titleCardSvg(prompt: string, hash: number): string {
  const hue = hash % 360;
  const label = escapeXml(prompt.trim().slice(0, 48) || "atelier");
  const stripes = Array.from({ length: 5 }, (_, i) => {
    const x = (hash >>> (i * 5)) % 560;
    const h = 40 + ((hash >>> (i * 3)) % 160);
    const fill = `hsl(${(hue + i * 24) % 360}, 45%, ${12 + i * 4}%)`;
    return `<rect x="${x}" y="${340 - h}" width="14" height="${h}" rx="4" fill="${fill}" opacity="0.8"/>`;
  }).join("");
  const orb = `<circle cx="${120 + (hash % 400)}" cy="110" r="56" fill="hsl(${(hue + 60) % 360}, 60%, 45%)" opacity="0.35"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">` +
    `<rect width="640" height="360" fill="hsl(${hue}, 40%, 14%)"/>` +
    orb + stripes +
    `<text x="320" y="160" text-anchor="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="30" fill="#E8B478" letter-spacing="6">ATELIER DEMO REEL</text>` +
    `<text x="320" y="204" text-anchor="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="16" fill="#B8A898">${label}</text>` +
    `<text x="320" y="332" text-anchor="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="12" fill="#8A7A6A">DEMO zero-key render</text>` +
    `</svg>`
  );
}

/**
 * Resolves the ffmpeg binary defensively: explicit override, the package's
 * own export, then node_modules by cwd, then a system ffmpeg. The bundler
 * can rewrite the package's path resolution, so never trust it alone.
 */
async function resolveFfmpeg(): Promise<string> {
  const override = process.env.ATELIER_FFMPEG_PATH;
  if (override) {
    return override;
  }
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const candidates = [
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const packaged = (await import("ffmpeg-static")).default as string;
  return packaged;
}

function fnv(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\s+/g, " ")
    .trim();
}
