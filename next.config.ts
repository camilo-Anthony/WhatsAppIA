import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    memoryBasedWorkersCount: true,
  },
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "jimp",
    "sharp",
    "pino",
    "bullmq",
    "ioredis",
  ],
};

export default nextConfig;
