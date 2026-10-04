import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env.VETO_E2E ? ".next-e2e" : ".next",
  transpilePackages: ["@vetoexpress/utils"],
}

export default nextConfig
