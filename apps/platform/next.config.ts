import createNextIntlPlugin from "next-intl/plugin"

const nextConfig = {
  distDir: process.env.VETO_E2E ? ".next-e2e" : ".next",
  transpilePackages: ["@vetoexpress/auth", "@vetoexpress/utils"],
}

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig)
