import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoProvider, VideoSubmitInput, VideoSubmitResult, VideoPollResult } from "./port";

/**
 * The zero-key demo video provider: renders a deterministic labeled clip with
 * the bundled ffmpeg binary (ffmpeg-static). Palette and pacing derive from
 * the prompt hash; every frame is watermarked DEMO so mock output can never
 * masquerade as a real generation. The clip is an original composition, not
 * a copied sample.
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
  const hue2 = (hue + 60) % 360;
  const label = escapeDrawtext(prompt.trim().slice(0, 48) || "atelier");
  const duration = Math.min(8, Math.max(2, seconds));
  const dir = await mkdtemp(join(tmpdir(), "atelier-reel-"));

  try {
    const pulse = Math.max(0.4, duration / 3).toFixed(2);
    const bg = hslHex(hue, 40, 14);
    const flash = hslHex(hue2, 60, 45);
    const filter = [
      `drawbox=x=0:y=0:w=iw:h=ih:color=${flash}:t=fill:enable='lt(mod(t,${pulse}),0.4)'`,
      `drawtext=text='ATELIER DEMO REEL':fontcolor=0xE8B478:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2-20`,
      `drawtext=text='${label}':fontcolor=0xB8A898:fontsize=16:x=(w-text_w)/2:y=(h-text_h)/2+24`,
      `drawtext=text='DEMO zero-key render':fontcolor=0x8A7A6A:fontsize=12:x=(w-text_w)/2:y=h-28`,
      "format=yuv420p",
    ].join(",");

    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(ffmpegPath, [
        "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", `color=c=${bg}:s=640x360:d=${duration}:r=24`,
        "-vf", filter,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        join(dir, "reel.mp4"),
      ]);
      child.on("error", reject);
      child.on("close", resolve);
    });
    if (code !== 0) {
      throw new Error(`ffmpeg exited ${code}`);
    }
    const file = await readFile(join(dir, "reel.mp4"));
    return new Uint8Array(file);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
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

/** HSL to ffmpeg hex color; ffmpeg rejects hsl() strings. */
function hslHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = h / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [chroma, x, 0];
  else if (hp < 2) [r, g, b] = [x, chroma, 0];
  else if (hp < 3) [r, g, b] = [0, chroma, x];
  else if (hp < 4) [r, g, b] = [0, x, chroma];
  else if (hp < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  const m = light - chroma / 2;
  const to255 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `0x${to255(r)}${to255(g)}${to255(b)}`;
}

function fnv(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeDrawtext(value: string): string {
  return value.replace(/[':\\]/g, " ").replace(/\s+/g, " ").trim();
}

