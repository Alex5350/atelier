import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules must stay outside the bundler: their runtime path
  // resolution (ffmpeg-static) and binaries (sharp) break when inlined.
  serverExternalPackages: ["ffmpeg-static", "sharp"],
  /* config options here */
};

export default nextConfig;
