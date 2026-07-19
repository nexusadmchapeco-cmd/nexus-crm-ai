import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O binário do ffmpeg (voz da Nina em ogg/opus) não pode ser empacotado
  // pelo webpack; precisa ir como arquivo junto da função serverless.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
