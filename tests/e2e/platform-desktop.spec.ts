import { test, expect, type Page } from '@playwright/test'

const base = 'http://localhost:4174'

async function desktop(page: Page) {
  await page.addInitScript(() => {
    const runtime = window as typeof window & {
      electron: { ipcRenderer: { send: (channel: string) => void } }
      windowCommands: string[]
    }
    runtime.windowCommands = []
    runtime.electron = { ipcRenderer: { send: (channel) => runtime.windowCommands.push(channel) } }
  })
}

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('veto_token', 'test-owner-token'))
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { ok: true, user: { name: '测试组织者', email: 'test@example.test' } } }))
  await page.route('**/v1/conferences?*', (route) => route.fulfill({ json: { ok: true, conferences: [], nextCursor: null } }))
}

test('App 窗口：登录页显示控件，主题按钮不重叠且可以切换', async ({ page }) => {
  await desktop(page)
  await page.goto(`${base}/login`)
  const minimize = page.getByRole('button', { name: '最小化', exact: true })
  await expect(minimize).toBeVisible()
  const theme = page.getByRole('button', { name: '切换主题', exact: true })
  await expect(theme).toHaveCount(1)
  const themeBox = await theme.boundingBox()
  const minimizeBox = await minimize.boundingBox()
  expect(themeBox!.x + themeBox!.width).toBeLessThanOrEqual(minimizeBox!.x)
  expect(await page.locator('.platform-titlebar').evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('drag')
  expect(await page.locator('.platform-window-actions').evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('no-drag')
  await page.screenshot({ path: test.info().outputPath('desktop-login.png') })
  const wasDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'))
  await theme.click()
  await expect.poll(() => page.locator('html').evaluate((el) => el.classList.contains('dark'))).toBe(!wasDark)
  await minimize.click()
  await page.getByRole('button', { name: '最大化 / 还原', exact: true }).click()
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click()
  await page.locator('.platform-titlebar').getByRole('button', { name: '返回应用', exact: true }).click()
  expect(await page.evaluate(() => (window as typeof window & { windowCommands: string[] }).windowCommands)).toEqual(['window:minimize', 'window:maximize', 'window:close', 'window:return-to-app'])
})

test('App 窗口：隐藏页脚，导航与刷新后仍保留窗口控件', async ({ page }) => {
  await desktop(page)
  await login(page)
  await page.goto(base)
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible()
  await expect(page.locator('header')).toHaveCount(1)
  await expect(page.locator('.platform-titlebar').getByRole('link', { name: '用户 测试组织者' })).toBeVisible()
  await expect(page.locator('.platform-titlebar').getByRole('button', { name: '退出登录' })).toBeVisible()
  await expect(page.locator('footer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '切换主题' })).toHaveCount(1)
  await page.screenshot({ path: test.info().outputPath('desktop-platform.png') })
  await page.getByRole('link', { name: '用户 测试组织者' }).click()
  await expect(page).toHaveURL(`${base}/account`)
  await page.locator('.platform-titlebar').getByRole('button', { name: '后退', exact: true }).click()
  await expect(page).toHaveURL(`${base}/`)
  await page.locator('.platform-titlebar').getByRole('button', { name: '前进', exact: true }).click()
  await expect(page).toHaveURL(`${base}/account`)
  await page.locator('.platform-titlebar').getByRole('link', { name: '返回大会列表' }).click()
  await expect(page).toHaveURL(`${base}/`)
  await page.getByRole('link', { name: '用户 测试组织者' }).click()
  await expect(page).toHaveURL(`${base}/account`)
  await page.reload()
  await expect(page.getByRole('button', { name: '最小化', exact: true })).toBeVisible()
  await expect(page.locator('footer')).toHaveCount(0)
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(`${base}/login`)
  await expect(page.getByRole('button', { name: '最小化', exact: true })).toBeVisible()
})

test('浏览器直接访问：保留页脚且不显示窗口控件', async ({ page }) => {
  await login(page)
  await page.goto(base)
  await expect(page.locator('footer')).toBeVisible()
  await expect(page.getByRole('button', { name: '最小化', exact: true })).toHaveCount(0)
})

test('网页版 App 入口：登录跳转与刷新后隐藏页脚，不显示原生控件', async ({ page }) => {
  await page.goto(`${base}/?from=app`)
  await expect(page).toHaveURL(`${base}/login`)
  await login(page)
  await page.goto(base)
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible()
  await expect(page.locator('footer')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible()
  await expect(page.locator('footer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '最小化', exact: true })).toHaveCount(0)
})
