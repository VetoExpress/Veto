import { test, expect } from '@playwright/test'

for (const viewport of [
  { width: 1200, height: 720 },
  { width: 390, height: 640 }
]) {
  test(`大会首页在 ${viewport.width}×${viewport.height} 窗口可滚动到列表末尾`, async ({
    page,
    baseURL
  }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => {
      localStorage.setItem(
        'veto_conferences',
        JSON.stringify(
          Array.from({ length: 20 }, (_, index) => ({
            id: `scroll-${index}`,
            name: `滚动测试大会 ${index + 1}`,
            source: 'cloud',
            createdAt: 1,
            committees: []
          }))
        )
      )
    })

    await page.goto(new URL('/conference', baseURL ?? 'http://localhost:4173').href)
    const scrollViewport = page.locator('[data-slot="scroll-area-viewport"]')
    const lastConference = page.getByRole('heading', { name: '滚动测试大会 20', exact: true })
    await expect(lastConference).toBeAttached()
    await expect
      .poll(() => scrollViewport.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(0)

    await scrollViewport.hover()
    await page.mouse.wheel(0, 500)
    await expect
      .poll(() => scrollViewport.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)

    await scrollViewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(lastConference).toBeInViewport()
    await expect(page.locator('header')).toBeInViewport({ ratio: 1 })
    await expect(page.locator('footer')).toBeInViewport({ ratio: 1 })
  })
}
