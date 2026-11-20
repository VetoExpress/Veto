import { test, expect } from '@playwright/test'

const base = 'http://localhost:4173'

test('首次认领席位后进入主席台，刷新后仍保持主席身份', async ({ page }) => {
  // The conference already exists from a different committee identity.
  await page.addInitScript(() => {
    if (localStorage.getItem('veto_conferences')) return
    localStorage.setItem('veto_conferences', JSON.stringify([{
      id: 'c', name: '浏览器测试大会', source: 'cloud',
      committees: [{ id: 'previous-committee', name: 'AAA', seats: [] }]
    }]))
  })
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
  await expect(page.getByRole('button', { name: '开始点名', exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: '开始点名', exact: true })).toBeVisible()
})
