import { bindings, defineConfig, defineWorker } from "cf/config"

export default defineConfig({
  worker: defineWorker({
    name: "veto-platform",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-24",
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
    },
  }),
})
