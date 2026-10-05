import { test, expect } from '@playwright/test'

test('最近打开的云端大会重新认证席位后进入对应会场', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('veto_conferences', JSON.stringify([{
      id: 'recent-cloud', name: '最近云端大会', source: 'cloud', createdAt: 1,
      committees: [{ id: 'committee', name: '测试会场', seats: [] }]
    }]))
    localStorage.setItem('veto_last_opened_conference', 'recent-cloud')
    localStorage.setItem('veto.cloud-memberships', JSON.stringify([{
      inviteCode: 'ABCD-EFGH-JK23', conferenceId: 'recent-cloud', conferenceName: '最近云端大会', organizer: '测试模联',
      committeeId: 'committee', committeeName: '测试会场', committeeType: 'cabinet', seatId: 'seat', seatName: '中国', seatShortName: '中国',
      roleTemplateId: 'role', roleName: '代表', capabilities: [], isChair: false, userId: 'user', displayName: '测试代表',
      hasPassword: false, createdAt: 1, updatedAt: 2
    }]))
  })
  let authenticated = false
  await page.route('**/v1/veto/join/authenticate', async (route) => {
    authenticated = true
    expect(route.request().postDataJSON()).toEqual({ inviteCode: 'ABCD-EFGH-JK23' })
    await route.fulfill({ json: {
      token: 'seat-token', inviteCode: 'ABCD-EFGH-JK23', conferenceId: 'recent-cloud', conferenceName: '最近云端大会', organizer: '测试模联',
      committeeId: 'committee', committeeName: '测试会场', committeeType: 'cabinet', seatId: 'seat', seatName: '中国', seatShortName: '中国',
      roleTemplateId: 'role', roleName: '代表', capabilities: [], seatState: 'claimed', hasPassword: false, wsUrl: '', isChair: false,
      identity: { userId: 'user', displayName: '测试代表', conferenceId: 'recent-cloud', committeeId: 'committee', seatId: 'seat', roleTemplateId: 'role', roleName: '代表', capabilities: [], isChair: false }
    } })
  })
  await page.goto('http://localhost:4173/conference')
  await expect(page.getByText('你的会议总数')).toHaveCount(0)
  await page.getByRole('button', { name: '进入工作台', exact: true }).click()
  await expect(page).toHaveURL(/\/client\/recent-cloud\/committee\/committee$/)
  expect(authenticated).toBe(true)
})
