import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  // Allows an isolated production verification build alongside the dev server.
  distDir: process.env.IRIS_NEXT_DIST_DIR || '.next',
  // Next's dev streaming/compression path can accumulate Gzip drain listeners.
  // Local development does not need response compression; retain it in production.
  compress: phase !== PHASE_DEVELOPMENT_SERVER,
});

export default nextConfig;
