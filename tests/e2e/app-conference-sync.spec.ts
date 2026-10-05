import { test, expect } from '@playwright/test'
test('账号大会列表展示平台分页并同步和恢复本地存档，开关关闭后停止上传', async ({ page }) => {
  await page.addInitScript(() => {
    const session = { user: { email: 'owner@example.test', name: '测试用户', avatar: '', organization: '测试模联' }, persistent: false, warning: null }
    Object.assign(window, {
      electron: { ipcRenderer: { send() {} } },
      veto: { account: {
        getSession: async () => ({ ok: true, session }),
        getAccessToken: async () => ({ ok: true, token: 'account-token', session }),
        onChanged: () => () => {}, signOut: async () => ({ ok: true, session })
      } }
    })
    if (!localStorage.getItem('veto_conferences')) localStorage.setItem('veto_conferences', JSON.stringify([{
      id: 'local', name: '本机单例大会', mode: 'singleton', createdAt: 1, updatedAt: 2,
      committees: [{ id: 'local-committee', name: '安理会', seats: [], minutes: [] }]
    }]))
  })
  const platform = (id: string) => ({ id, name: `平台大会 ${id}`, lifecycle: 'draft', createdAt: '2026-10-05T11:49:00+08:00', updatedAt: '2026-10-05' })
  const archives = new Map<string, { conferenceId: string; snapshot: unknown; version: number }>([['remote', {
    conferenceId: 'remote', version: 1, snapshot: { id: 'remote', name: '另一设备的大会', mode: 'singleton', createdAt: 1, updatedAt: 2, committees: [{ id: 'remote-committee', name: '测试会场', seats: [] }] }
  }]])
  let localUploads = 0
  await page.route('**/v1/conferences?**', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer account-token')
    const next = new URL(route.request().url()).searchParams.has('cursor')
    await route.fulfill({ json: { conferences: [platform(next ? 'second' : 'first')], nextCursor: next ? null : 'next' } })
  })
  await page.route('**/v1/conferences/*', (route) => route.fulfill({ json: { conference: { committees: [
    { seats: Array.from({ length: 10 }, (_, index) => ({ id: `seat-${index}` })) },
    { seats: [{ id: 'one' }, { id: 'two' }] }
  ] } } }))
  await page.route('**/v1/app-conferences**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { archives: [...archives.values()], nextCursor: null } })
    const snapshot = route.request().postDataJSON().snapshot
    if (snapshot.id === 'local') localUploads++
    const version = (archives.get(snapshot.id)?.version ?? 0) + 1
    archives.set(snapshot.id, { conferenceId: snapshot.id, snapshot, version })
    await route.fulfill({ json: { version } })
  })
  await page.goto('http://localhost:4173/conference')
  await expect(page.getByRole('heading', { name: '平台大会 first' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '平台大会 second' })).toBeVisible()
  const platformCard = page.getByRole('link').filter({ has: page.getByRole('heading', { name: '平台大会 first' }) })
  await expect(platformCard).toContainText('2 个会场')
  await expect(platformCard).toContainText('12 个席位')
  await expect(platformCard).toContainText('2026/10/5')
  const box = await platformCard.boundingBox()
  expect(box!.height).toBeLessThan(110)
  expect(box!.width).toBeGreaterThan(600)
  await platformCard.screenshot({ path: test.info().outputPath('compact-platform-card.png') })
  await expect(page.getByRole('button', { name: '另一设备的大会', exact: true })).toBeVisible()
  await expect.poll(() => localUploads).toBe(1)
  await page.getByRole('button', { name: '另一设备的大会', exact: true }).click()
  await expect(page).toHaveURL(/\/client\/remote\/committee\/remote-committee\/chair$/)
  await expect(page.getByRole('button', { name: '开始点名', exact: true })).toBeVisible()
  await page.goto('http://localhost:4173/conference')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '账号设置', exact: true }).click()
  const toggle = page.getByRole('switch', { name: '大会云同步' })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await page.reload()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '账号设置', exact: true }).click()
  await expect(page.getByRole('switch', { name: '大会云同步' })).not.toBeChecked()
  expect(localUploads).toBe(1)
  await page.screenshot({ path: test.info().outputPath('account-cloud-sync.png') })
  await page.keyboard.press('Escape')
  await page.route('https://platform.miaoyww.top/conferences/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>平台大会详情</h1>' }))
  await page.getByRole('button', { name: '打开云平台', exact: true }).first().click()
  await expect(page).toHaveURL('https://platform.miaoyww.top/conferences/first?from=app')
})
