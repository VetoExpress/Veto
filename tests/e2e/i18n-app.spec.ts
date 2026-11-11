import { test, expect } from '@playwright/test'

const base = 'http://localhost:4173'

test('App language switch preserves the document and an unfinished conference draft', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('veto-locale', 'zh-CN')
    Object.assign(window, { documentIdentity: crypto.randomUUID() })
  })
  await page.goto(`${base}/conference`)
  const identity = await page.evaluate(() => (window as unknown as { documentIdentity: string }).documentIdentity)
  await page.getByRole('button', { name: '创建大会', exact: true }).first().click()
  await page.getByRole('radio', { name: /单例模式/ }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.locator('#event-name').fill('保留这份草稿 / keep this draft')

  await page.evaluate(() => {
    localStorage.setItem('veto-locale', 'en-US')
    window.dispatchEvent(new StorageEvent('storage', { key: 'veto-locale', newValue: 'en-US' }))
  })
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible()
  await expect(page.locator('#event-name')).toHaveValue('保留这份草稿 / keep this draft')
  expect(await page.evaluate(() => (window as unknown as { documentIdentity: string }).documentIdentity)).toBe(identity)

  await page.evaluate(() => {
    localStorage.setItem('veto-locale', 'zh-CN')
    window.dispatchEvent(new StorageEvent('storage', { key: 'veto-locale', newValue: 'zh-CN' }))
  })
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeVisible()
  await expect(page.locator('#event-name')).toHaveValue('保留这份草稿 / keep this draft')
})

test('settings switch language instantly and persist the preference', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('veto-locale')) localStorage.setItem('veto-locale', 'zh-CN')
  })
  await page.goto(`${base}/conference`)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page.getByRole('dialog').getByText('Interface language', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '中文', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
})
