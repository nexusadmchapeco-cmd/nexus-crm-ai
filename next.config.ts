import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
