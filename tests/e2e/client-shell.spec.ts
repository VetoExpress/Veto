import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((overviewTest) => {
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
    const capabilities = overviewTest
      ? ['submit_directive', 'view_situation', 'view_news', 'view_files']
      : ['control_conference', 'view_news', 'view_files', 'view_situation']
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
          wsUrl: overviewTest ? 'ws://localhost:4173/overview-test' : '',
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
  }, testInfo.title.startsWith('概览自动'))
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
  await page.route('**/v1/veto/timeline', (route) => {
    return route.fulfill({
      json: {
        ok: true,
        timezone: 'Asia/Shanghai',
        timeline: {
          id: 'timeline',
          name: '测试时间线',
          currentTime: Date.UTC(2026, 0, 1),
          ratio: 1,
          paused: true,
          version: 1
        }
      }
    })
  })
  await page.route('**/v1/veto/situations', (route) =>
    route.fulfill({
      json: {
        ok: true,
        timezone: 'Asia/Shanghai',
        situations: [
          {
            id: 'older',
            status: 'published',
            content: '较早发布的局势',
            contentTime: Date.UTC(2026, 0, 3),
            publishedAt: '2026-01-01T00:00:00Z'
          },
          {
            id: 'latest',
            status: 'published',
            content: '**最新局势正文**<script>window.overviewXss = true</script>',
            contentTime: Date.UTC(2026, 0, 1),
            publishedAt: '2026-01-02T00:00:00Z'
          }
        ]
      }
    })
  )
  await page.route('**/v1/veto/news', (route) =>
    route.fulfill({
      json: {
        ok: true,
        timezone: 'Asia/Shanghai',
        news: [
          {
            id: 'published',
            status: 'published',
            title: '大会新闻测试标题',
            content: '新闻测试正文',
            source: '测试通讯社',
            contentTime: Date.UTC(2026, 0, 1),
            createdAt: '2026-01-01T00:00:00Z',
            publishedAt: '2026-01-02T00:00:00Z'
          },
          {
            id: 'withdrawn',
            status: 'withdrawn',
            title: '已撤回新闻不应显示',
            content: '',
            source: '测试通讯社',
            contentTime: Date.UTC(2026, 0, 1),
            createdAt: '2026-01-01T00:00:00Z'
          }
        ]
      }
    })
  )
})

test('工作区与会场标题栏保持一致，侧栏固定展开，多数门槛仅在主席页显示', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: '概览', exact: true })).toBeVisible()
  await expect(page.getByText('测试时间线', { exact: true })).toBeVisible()
  await expect(header.getByText('测试时间线', { exact: true })).toHaveCount(0)
  await expect(page.getByText('最新局势正文', { exact: true })).toBeVisible()
  await expect(page.getByText('较早发布的局势', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '大会新闻测试标题' })).toBeVisible()
  await expect(page.getByText('已撤回新闻不应显示')).toHaveCount(0)
  expect(await page.evaluate(() => 'overviewXss' in window)).toBe(false)
  const overview = page.getByRole('button', { name: '概览', exact: true })
  await expect(overview).toHaveAttribute('aria-current', 'page')
  await expect(overview).toHaveCSS('height', '38px')
  await expect(overview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(overview).not.toHaveCSS('box-shadow', 'none')
  await page.getByRole('button', { name: '刷新时间线', exact: true }).click()
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
  await expect(chair).toHaveAttribute('aria-current', 'page')
  await expect(chair).toHaveCSS('height', '38px')
  await expect(chair).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
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

test('概览自动加载并响应推送，侧栏按钮仅以阴影区分选中状态', async ({ page }) => {
  let notifyTimeline = () => {}
  await page.routeWebSocket('**/overview-test', (socket) => {
    socket.send(JSON.stringify({ type: 'ready' }))
    notifyTimeline = () => socket.send(JSON.stringify({ type: 'invalidate', topics: ['timeline'] }))
  })
  await page.route('**/v1/veto/files/notifications**', (route) =>
    route.fulfill({ json: { ok: true, notifications: [], nextCursor: 0 } })
  )
  let timelineRequests = 0
  await page.route('**/v1/veto/timeline', (route) => {
    timelineRequests += 1
    return route.fulfill({
      json: {
        ok: true,
        timezone: 'Asia/Shanghai',
        timeline: {
          id: 'timeline',
          name: `时间线版本 ${timelineRequests}`,
          currentTime: Date.UTC(2026, 0, 1),
          paused: true,
          ratio: 1,
          version: timelineRequests
        }
      }
    })
  })
  await page.setViewportSize({ width: 1200, height: 720 })
  await page.goto('http://localhost:4173/client/shell/committee/committee')
  await expect(page.getByText(/^时间线版本 \d+$/)).toBeVisible()
  await expect(page.getByText('最新局势正文', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '大会新闻测试标题' })).toBeVisible()
  const navigation = page.locator('.client-navigation [data-slot="sidebar-menu-button"]')
  await expect(navigation).toHaveText(['概览', '指令', '局势', '新闻', '文件'])
  for (const button of await navigation.all()) {
    await expect(button).toHaveCSS('height', '38px')
    await expect(button).toHaveCSS('cursor', 'pointer')
  }
  const overview = navigation.first()
  const inactive = navigation.nth(1)
  await expect(overview).not.toHaveCSS('box-shadow', 'none')
  await expect(inactive).toHaveCSS('box-shadow', 'none')
  const inactiveColor = await inactive.evaluate((element) => getComputedStyle(element).color)
  await overview.hover()
  await expect(overview).toHaveCSS('color', inactiveColor)
  await expect(overview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const beforeNotification = timelineRequests
  notifyTimeline()
  await expect.poll(() => timelineRequests).toBeGreaterThan(beforeNotification)
  const beforeRefresh = timelineRequests
  await page.getByRole('button', { name: '刷新时间线', exact: true }).click()
  await expect.poll(() => timelineRequests).toBeGreaterThan(beforeRefresh)
  await page.screenshot({ path: 'test-results/client-overview-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 680, height: 720 })
  await expect(page.getByText(/^时间线版本 \d+$/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  await page.screenshot({ path: 'test-results/client-overview-mobile.png', fullPage: true })
})
