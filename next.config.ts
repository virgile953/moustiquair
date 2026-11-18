import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for the production Docker image.
  // `bun run start` (without Docker) still works from the regular `.next` folder.
  output: "standalone",

  // `bun:sqlite` is a built-in Bun module. It must stay external so that the
  // bundler does not try to resolve it as an npm package.
  serverExternalPackages: ["bun:sqlite"],

  // The workspace lives inside a larger monorepo-like directory; pinning the
  // root avoids Next.js inferring a parent folder as the project root.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
