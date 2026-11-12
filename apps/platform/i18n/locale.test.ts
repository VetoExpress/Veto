import { describe, expect, it } from "vitest"
import { defaultLocale, resolveLocale, resolvePreferredLocale } from "./locale"

describe("locale resolution", () => {
  it("resolves supported language tags and falls back to the default", () => {
    expect(resolveLocale("en-US")).toBe("en-US")
    expect(resolveLocale("zh-Hans-CN")).toBe("zh-CN")
    expect(resolveLocale("fr-FR")).toBe(defaultLocale)
  })

  it("uses the first supported language in a weighted header", () => {
    expect(resolvePreferredLocale("fr-FR, zh-CN;q=0.9, en-US;q=0.8")).toBe(
      "zh-CN"
    )
    expect(resolvePreferredLocale("en-GB,en;q=0.9")).toBe("en-US")
    expect(resolvePreferredLocale("de-DE")).toBe(defaultLocale)
  })
})
