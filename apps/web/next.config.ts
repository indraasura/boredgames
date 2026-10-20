import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // No server and no database: the whole site is static files.
  output: "export",
  reactStrictMode: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@boredgames/engine", "@boredgames/milestones", "@boredgames/f1"],
  turbopack: { root: path.join(__dirname, "../..") },
};

export default config;
