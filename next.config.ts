import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
