import { test, expect } from '@playwright/test'

test('工作区与会场标题栏保持一致，侧栏固定展开，多数门槛仅在主席页显示', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('veto-locale', 'zh-CN')
    localStorage.setItem(
      'veto_conferences',
      JSON.stringify([
        {
          id: 'shell',
          name: '布局测试大会',
          source: 'cloud',
          committees: [{ id: 'committee', name: '安全理事会', type: 'cabinet', seats: [] }]
        }
      ])
    )
    const capabilities = ['control_conference', 'view_news', 'view_files']
    sessionStorage.setItem(
      'veto.cloud-seat-session',
      JSON.stringify({
        connectedAt: Date.now(),
        result: {
          conferenceId: 'shell',
          conferenceName: '布局测试大会',
          committeeId: 'committee',
          committeeName: '安全理事会',
          seatId: 'chair',
          seatName: '主席',
          seatShortName: '主席',
          roleName: '主席',
          token: 'shell-test',
          wsUrl: '',
          committeeType: 'cabinet',
          identity: {
            userId: 'u',
            displayName: '测试主席',
            conferenceId: 'shell',
            committeeId: 'committee',
            seatId: 'chair',
            roleName: '主席',
            capabilities
          }
        }
      })
    )
  })
  await page.route('**/v1/veto/chair/committee', (route) =>
    route.fulfill({
      json: {
        conference: { id: 'shell', name: '布局测试大会', organizer: '测试学校' },
        committee: { id: 'committee', name: '安全理事会', type: 'cabinet' },
        chairSeat: {
          id: 'chair',
          name: '主席',
          roleName: '主席',
          capabilities: ['control_conference'],
          user: { id: 'u', displayName: '测试主席' }
        },
        seats: [{ id: 'china', name: '中国', roleName: '代表', hasVotingRights: true, user: null }]
      }
    })
  )
  await page.setViewportSize({ width: 1200, height: 720 })
  await page.goto('http://localhost:4173/conference')
  await expect(page.getByRole('heading', { name: '工作区', exact: true })).toBeVisible()

  // Install only the desktop bridges needed to mount the real window controls.
  await page.addInitScript(() => {
    Object.assign(window, {
      electron: { ipcRenderer: { send: () => {} } },
      veto: { plugins: { list: async () => [] } }
    })
  })
  await page.goto('http://localhost:4173/client/shell/committee/committee')
  const header = page.locator('header').first()
  await expect(header.getByRole('button', { name: '关闭', exact: true })).toBeVisible()
  const clientHeader = await header.boundingBox()
  const clientClose = await header.getByRole('button', { name: '关闭', exact: true }).boundingBox()
  await expect(header.getByRole('button', { name: '切换侧边栏' })).toHaveCount(0)
  await expect(page.locator('[data-slot="sidebar-rail"]')).toHaveCount(0)
  await expect(header.getByText('简单多数', { exact: true })).toHaveCount(0)
  await expect(header.getByRole('button', { name: '插件', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '军事推演', exact: true })).toHaveCount(0)
  const chair = page.getByRole('button', { name: '主席', exact: true })
  const beforeShortcut = await chair.boundingBox()
  await page.keyboard.press('Control+b')
  await expect(chair).toBeVisible()
  expect(await chair.boundingBox()).toEqual(beforeShortcut)

  await header.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await chair.click()
  await expect(page.getByRole('button', { name: '开始点名', exact: true })).toBeVisible()
  await expect(page.locator('main').getByText('简单多数', { exact: true })).toBeVisible()
  await expect(page.locator('main').getByText('2/3 多数', { exact: true })).toBeVisible()
  await header.getByRole('button', { name: '返回首页', exact: true }).click()
  await expect(page).toHaveURL(/\/conference$/)
  const workspaceHeader = await header.boundingBox()
  const workspaceClose = await header
    .getByRole('button', { name: '关闭', exact: true })
    .boundingBox()
  expect(clientHeader?.height).toBe(48)
  expect(workspaceHeader?.height).toBe(clientHeader?.height)
  expect(clientClose).toEqual(workspaceClose)
})
