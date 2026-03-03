import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "jimp",
    "sharp",
    "pino",
  ],
};

export default nextConfig;
