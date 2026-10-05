import { test, expect, type Page } from '@playwright/test'

const base = 'http://localhost:4174'
const conference = {
  id: 'c', name: '测试大会', description: '', organizer: '学校', version: 1, lifecycle: 'active', mode: 'conference', timezone: 'Asia/Shanghai',
  createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z', timelineMode: 'none', timeline: null,
  roleTemplates: [{ id: 'r', name: '主席', capabilities: ['control_conference'] }],
  committees: [{ id: 'cm', name: '安理会', type: 'cabinet', agenda: [], seats: [{ id: 's', name: '主席席位', roleTemplateId: 'r', hasVotingRights: false, inviteCode: 'ABCD-EFGH-JK23', inviteActive: true }] }],
}
async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('veto_token', 'test-owner-token'))
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { ok: true, user: { name: '测试组织者', email: 'test@example.test' } } }))
}

test('删除大会使用应用内确认弹窗，取消不删除，确认后返回列表', async ({ page }) => {
  await login(page)
  let deleted = false
  let nativeDialogs = 0
  page.on('dialog', async (dialog) => {
    nativeDialogs++
    await dialog.dismiss()
  })
  await page.route('**/v1/conferences/c', (route) => {
    if (route.request().method() === 'DELETE') {
      deleted = true
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: { ok: true, conference } })
  })
  await page.route('**/v1/conferences', (route) => route.fulfill({ json: { ok: true, conferences: [] } }))
  await page.goto(`${base}/conferences/c`)
  await page.getByRole('button', { name: '删除大会', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '确认删除大会？' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('测试大会')
  expect(nativeDialogs).toBe(0)
  expect(deleted).toBe(false)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(deleted).toBe(false)
  await page.getByRole('button', { name: '删除大会', exact: true }).click()
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page).toHaveURL(`${base}/`)
  expect(deleted).toBe(true)
  expect(nativeDialogs).toBe(0)
})

test('找回密码：发送验证码、校验重复密码、提交后返回登录', async ({ page }) => {
  let submitted: unknown
  await page.route('**/v1/auth/forgot-password', (route) => route.fulfill({ json: { ok: true } }))
  await page.route('**/v1/auth/reset-password', (route) => { submitted = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }) })
  await page.goto(`${base}/login`)
  await page.getByRole('button', { name: '忘记密码' }).click()
  await page.getByLabel('注册邮箱').fill('test@example.test')
  await page.getByRole('button', { name: '发送验证码', exact: true }).click()
  await page.getByLabel('验证码', { exact: true }).fill('123456')
  await page.getByLabel('新密码', { exact: true }).fill('new-password')
  await page.getByLabel('确认新密码').fill('different')
  await page.getByRole('button', { name: '重设密码', exact: true }).click()
  await expect(page.getByText('两次输入的密码不一致')).toBeVisible()
  expect(submitted).toBeUndefined()
  await page.getByLabel('确认新密码').fill('new-password')
  await page.getByRole('button', { name: '重设密码', exact: true }).click()
  await expect(page.getByText('密码已重设，请使用新密码登录。')).toBeVisible()
  expect(submitted).toEqual({ email: 'test@example.test', code: '123456', password: 'new-password' })
})

test('开会前检查和席位排障：查询、筛选、重置后刷新', async ({ page }) => {
  await login(page)
  let user: { id: string; displayName: string; claimedAt: string } | null = { id: 'u', displayName: '代表甲', claimedAt: '2026-10-04' }
  await page.route('**/v1/conferences/c', (route) => route.fulfill({ json: { ok: true, conference } }))
  await page.route('**/v1/conferences/c/seat-access', (route) => route.fulfill({ json: { ok: true, seats: [{ seatId: 's', committeeId: 'cm', user }] } }))
  await page.route('**/v1/conferences/c/seats/s/reset-user', (route) => {
    expect(route.request().postDataJSON()).toEqual({ userId: 'u', reason: '忘记密码' })
    user = null
    return route.fulfill({ json: { ok: true, seatId: 's' } })
  })
  await page.goto(`${base}/conferences/c`)
  await expect(page.getByRole('heading', { name: '开会前检查' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('readiness.png'), fullPage: true })
  await page.getByRole('button', { name: '前往席位总览' }).click()
  await expect(page.getByText('代表甲', { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('seats.png'), fullPage: true })
  await page.getByRole('button', { name: '重置认领', exact: true }).click()
  await page.getByLabel('重置原因').fill('忘记密码')
  await page.getByRole('button', { name: '确认重置认领' }).click()
  await page.getByLabel('认领状态', { exact: true }).selectOption('unclaimed')
  await expect(page.getByRole('cell', { name: '未认领', exact: true })).toBeVisible()
})

test('并发编辑：保留输入，选择冲突，按最新版本保存', async ({ page }) => {
  await login(page)
  let remote = structuredClone(conference)
  let attempts = 0
  await page.route('**/v1/conferences/c', (route) => {
    if (route.request().method() === 'PATCH') {
      attempts++
      if (attempts === 1) { remote = { ...remote, name: '远端名称', organizer: '远端学校', version: 2 }; return route.fulfill({ status: 409, json: { ok: false, error: { code: 'CONFERENCE_VERSION_CONFLICT', message: '版本变化' } } }) }
      expect(route.request().headers()['if-match']).toBe('"2"')
      remote = { ...remote, ...route.request().postDataJSON(), version: 3 }
    }
    return route.fulfill({ json: { ok: true, conference: remote } })
  })
  await page.goto(`${base}/conferences/c`)
  await page.getByRole('tab', { name: '大会设置' }).click()
  await page.getByLabel('大会名称', { exact: true }).fill('我的名称')
  await page.getByRole('button', { name: '保存基本信息' }).click()
  await page.getByRole('button', { name: '查看远端变更' }).click()
  await expect(page.getByRole('radio', { name: /保留我的修改/ })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('conflict.png'), fullPage: true })
  await page.getByRole('radio', { name: /保留我的修改/ }).check()
  await page.getByRole('button', { name: '应用合并结果' }).click()
  await expect(page.getByLabel('大会名称', { exact: true })).toHaveValue('我的名称')
  await expect(page.getByLabel('主办方', { exact: true })).toHaveValue('远端学校')
  await page.getByRole('button', { name: '保存基本信息' }).click()
  await expect(page.getByRole('heading', { name: '我的名称', exact: true })).toBeVisible()
  await expect(page.getByText('有未保存的修改，请保存基本信息或大会结构后离开。')).toHaveCount(0)
})
