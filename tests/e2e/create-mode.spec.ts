import { test, expect, type Page } from '@playwright/test'

const base = 'http://localhost:4173'

async function openCreatePage(page: Page) {
  await page.addInitScript(() => localStorage.setItem('veto-locale', 'zh-CN'))
  await page.goto(`${base}/conference`)
  await page
    .getByRole('button', { name: /创建大会/ })
    .first()
    .click()
  return page
}

test('云端大会只保留选择模式与进入平台，下一步进入云平台', async ({ page }) => {
  await page.route('https://platform.miaoyww.top/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Veto Platform</h1>' })
  )
  const view = await openCreatePage(page)

  await view.getByRole('radio', { name: /云端大会/ }).click()
  await expect(view.getByRole('tab')).toHaveCount(2)
  await expect(view.getByRole('tab').nth(0)).toContainText('选择模式')
  await expect(view.getByRole('tab').nth(1)).toContainText('进入平台')
  await expect(view.getByRole('tab', { name: /角色权限/ })).toHaveCount(0)

  await view.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page).toHaveURL(/platform\.miaoyww\.top/)
})

test('本地大会不显示角色权限且可进入大会详情', async ({ page }) => {
  const view = await openCreatePage(page)

  await view.getByRole('radio', { name: /本地大会/ }).click()
  await expect(view.getByRole('tab')).toHaveCount(6)
  await expect(view.getByRole('tab', { name: /角色权限/ })).toHaveCount(0)
  await expect(view.getByRole('tab', { name: '会场信息', exact: true })).toBeVisible()
  await expect(view.getByRole('tab', { name: '议事规则', exact: true })).toBeVisible()
  await expect(view.getByRole('tab', { name: /会场规划/ })).toHaveCount(0)

  await view.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.locator('#event-name')).toBeVisible()
})
