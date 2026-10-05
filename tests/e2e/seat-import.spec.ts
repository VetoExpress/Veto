import { test, expect, type Locator, type Page } from '@playwright/test'

async function importText(page: Page, card: Locator, target: string, text: string) {
  await card.getByRole('button', { name: '从文本导入', exact: true }).click()
  await page.getByRole('button', { name: '继续输入', exact: true }).click()
  await page.getByRole('dialog').last().locator('textarea').fill(text)
  await page.getByRole('button', { name: '读取并预览', exact: true }).click()
  await expect(page.getByText(`导入到：${target}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await expect(page.getByRole('heading', { name: '导入数据预览', exact: true })).toBeHidden()
}

async function importFile(page: Page, card: Locator, target: string, seat: string) {
  await card.getByRole('button', { name: '从 Excel 导入', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择文件', exact: true }).click()
  await (
    await chooser
  ).setFiles({
    name: 'seats.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`\uFEFF席位名称,席位简称,席位类型\n${seat},,\n`)
  })
  await page.getByRole('button', { name: '读取并预览', exact: true }).click()
  await expect(page.getByText(`导入到：${target}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await expect(page.getByRole('heading', { name: '导入数据预览', exact: true })).toBeHidden()
}

test('platform：两个会场分别导入，折叠后导入自动展开且保留原席位', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veto_token', 'test-owner-token'))
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({ json: { ok: true, user: { name: '测试组织者', email: 'test@example.test' } } })
  )
  await page.goto('http://localhost:4174/conferences/new')
  await page.locator('#event-name').fill('导入测试大会')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByLabel('会场名称').first().fill('第一会场')
  await page.getByRole('button', { name: '添加会场', exact: true }).click()
  await page.getByLabel('会场名称').last().fill('第二会场')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  const first = page
    .locator('[data-slot="collapsible"]')
    .filter({ has: page.getByRole('heading', { name: '第一会场', exact: true }) })
  const second = page
    .locator('[data-slot="collapsible"]')
    .filter({ has: page.getByRole('heading', { name: '第二会场', exact: true }) })
  await importText(page, first, '第一会场', '第一代表')
  await importFile(page, second, '第二会场', '第二代表')
  await expect(first.getByLabel('席位名称', { exact: true })).toHaveValue('第一代表')
  await expect(second.getByLabel('席位名称', { exact: true })).toHaveValue('第二代表')
  await first.getByRole('button', { name: '折叠第一会场席位' }).click()
  await second.getByRole('button', { name: '折叠第二会场席位' }).click()
  await expect(first.getByLabel('席位名称', { exact: true })).toBeHidden()
  await expect(second.getByLabel('席位名称', { exact: true })).toBeHidden()
  await importText(page, second, '第二会场', '追加代表')
  await expect(second.getByLabel('席位名称', { exact: true })).toHaveCount(2)
  await expect(second.getByLabel('席位名称', { exact: true }).first()).toHaveValue('第二代表')
  await expect(second.getByLabel('席位名称', { exact: true }).last()).toHaveValue('追加代表')
  await expect(first.getByLabel('席位名称', { exact: true })).toBeHidden()
  await first.getByRole('button', { name: '添加席位', exact: true }).click()
  await expect(first.getByLabel('席位名称', { exact: true }).first()).toHaveValue('第一代表')
  await expect(first.getByLabel('席位名称', { exact: true }).last()).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('platform-seat-cards.png'),
    fullPage: true,
    animations: 'disabled'
  })
})

test('App：单例会场卡片支持文本、文件导入和折叠，保留投票权', async ({ page }) => {
  await page.goto('http://localhost:4173/conference')
  await page.getByRole('button', { name: '创建大会', exact: true }).first().click()
  await page.getByRole('radio', { name: /单例模式/ }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.locator('#event-name').fill('单例导入测试')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByLabel('会场名称').fill('单例会场')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: '单例会场', exact: true }) })
  await importText(page, card, '单例会场', '观察员,,否')
  await expect(card.getByLabel('投票权')).not.toBeChecked()
  await card.getByRole('button', { name: '折叠单例会场席位' }).click()
  await expect(card.getByLabel('席位名称', { exact: true })).toBeHidden()
  await importFile(page, card, '单例会场', '代表')
  await expect(card.getByLabel('席位名称', { exact: true })).toHaveCount(2)
  await expect(card.getByLabel('席位名称', { exact: true }).first()).toHaveValue('观察员')
  await expect(card.getByLabel('席位名称', { exact: true }).last()).toHaveValue('代表')
  await expect(card.getByLabel('投票权').first()).not.toBeChecked()
  await expect(card.getByLabel('投票权').last()).toBeChecked()
  await page.screenshot({
    path: test.info().outputPath('app-seat-card.png'),
    fullPage: true,
    animations: 'disabled'
  })
})
