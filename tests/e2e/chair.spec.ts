import { test, expect, type Page } from '@playwright/test'

const base = 'http://localhost:4173'

async function openCommitteeSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '会议设置' }).click()
}

async function expectSnapshotOptions(page: Page, count: number): Promise<void> {
  await page.getByLabel('选择会议快照').click()
  await expect(page.getByRole('option')).toHaveCount(count)
  await page.keyboard.press('Escape')
}

test('首次认领席位后进入主席台，保存快照，刷新后仍可预览和恢复', async ({ page }) => {
  await page.route('https://api.miaoyww.top/**', (route): Promise<Response> => route.fulfill({ json: { ok: true } }))
  const target = {
    inviteCode: 'ABCD-EFGH-JK23', conferenceId: 'c', conferenceName: '浏览器测试大会', organizer: '测试学校',
    committeeId: 'cm', committeeName: '安理会', committeeType: 'cabinet', seatId: 's', seatName: '主席', seatShortName: '主席',
    roleTemplateId: 'r', roleName: '主席', capabilities: ['control_conference'], seatState: 'unclaimed', hasPassword: false, wsUrl: '', chair: null,
  }
  await page.route('**/v1/veto/join/validate', (route): Promise<Response> => route.fulfill({ json: target }))
  await page.route('**/v1/veto/join/claim', (route): Promise<Response> => {
    expect(route.request().postDataJSON()).toEqual({ inviteCode: target.inviteCode, displayName: '测试主席', password: 'test-password' })
    return route.fulfill({ json: { ...target, seatState: 'claimed', hasPassword: true, token: 'seat-token', isChair: true, identity: {
      userId: 'u', displayName: '测试主席', conferenceId: 'c', committeeId: 'cm', seatId: 's', roleTemplateId: 'r', roleName: '主席', capabilities: ['control_conference'], isChair: true,
    } } })
  })
  await page.route('**/v1/veto/chair/committee', (route): Promise<Response> => route.fulfill({ json: {
    conference: { id: 'c', name: target.conferenceName, organizer: target.organizer },
    committee: { id: 'cm', name: '安理会', type: 'cabinet' },
    chairSeat: { id: 's', name: '主席', roleTemplateId: 'r', roleName: '主席', capabilities: ['control_conference'], user: { id: 'u', displayName: '测试主席' } },
    seats: [{ id: 's', name: '主席', roleTemplateId: 'r', roleName: '主席', hasVotingRights: false, user: { id: 'u', displayName: '测试主席' } }, { id: 's2', name: '中国', roleTemplateId: 'delegate', roleName: '代表', hasVotingRights: true, user: null }],
  } }))
  await page.goto(`${base}/conference`)
  await page.getByRole('button', { name: '加入大会', exact: true }).first().click()
  await page.locator('#conference-invite-code').fill('ABCDEFGHJK23')
  await page.getByRole('button', { name: '加入', exact: true }).click()
  await page.getByRole('button', { name: '确认大会' }).click()
  await page.getByLabel('姓名', { exact: true }).fill('测试主席')
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeDisabled()
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(page).toHaveURL(/\/client\/c\/committee\/cm$/)
  await page.getByRole('button', { name: '主席', exact: true }).click()
  await expect(page.getByRole('button', { name: '立即保存', exact: true })).toBeVisible()

  await openCommitteeSettings(page)
  await page.getByRole('button', { name: '保存当前快照' }).click()
  await expectSnapshotOptions(page, 2)

  await page.reload()
  await openCommitteeSettings(page)
  await expectSnapshotOptions(page, 2)

  await page.getByLabel('选择会议快照').click()
  await page.getByRole('option').first().click()
  await expect(page.getByText(/发言队列：0 人/)).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('chair-recovery.png') })
  await page.getByRole('button', { name: '恢复这份快照' }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByRole('button', { name: '恢复这份快照' })).toBeHidden()

  await openCommitteeSettings(page)
  await expectSnapshotOptions(page, 3)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
