import { expect, test, type Page } from '@playwright/test'

const base = 'http://localhost:4174'
const conference = {
  id: 'i18n',
  name: '用户原文大会',
  description: '用户原文说明',
  organizer: '用户原文主办方',
  version: 1,
  lifecycle: 'active',
  mode: 'conference',
  timezone: 'Asia/Shanghai',
  startsAt: '2026-11-11T00:00:00Z',
  endsAt: '2026-11-12T00:00:00Z',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-11T00:00:00Z',
  timelineMode: 'none',
  timeline: null,
  roleTemplates: [{ id: 'chair', name: '用户原文主席', capabilities: ['control_conference'] }],
  committees: [
    {
      id: 'committee',
      name: '用户原文委员会',
      type: 'cabinet',
      agenda: [],
      seats: [
        {
          id: 'seat',
          name: '用户原文席位',
          roleTemplateId: 'chair',
          hasVotingRights: false,
          inviteCode: 'ABCD-EFGH-JK23',
          inviteActive: true
        }
      ]
    }
  ]
}

async function authenticate(page: Page) {
  await page.addInitScript(() => localStorage.setItem('veto_token', 'i18n-owner'))
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        ok: true,
        user: {
          name: '用户原文姓名',
          email: 'i18n@example.test',
          organization: '用户原文模联',
          avatar: ''
        }
      }
    })
  )
  await page.route('**/v1/conferences/i18n', (route) =>
    route.fulfill({ json: { ok: true, conference } })
  )
  await page.route('**/v1/conferences/i18n/seat-access', (route) =>
    route.fulfill({ json: { ok: true, seats: [] } })
  )
}

test('server first English and Chinese requests remain isolated', async ({ browser }) => {
  const english = await browser.newContext()
  const chinese = await browser.newContext()
  try {
    await english.addCookies([{ name: 'veto-locale', value: 'en-US', url: base }])
    await chinese.addCookies([{ name: 'veto-locale', value: 'zh-CN', url: base }])
    const [englishResponse, chineseResponse] = await Promise.all([
      english.request.get(`${base}/login`),
      chinese.request.get(`${base}/login`)
    ])
    const [englishHtml, chineseHtml] = await Promise.all([
      englishResponse.text(),
      chineseResponse.text()
    ])
    expect(englishHtml).toContain('lang="en-US"')
    expect(englishHtml).toContain('Log in or create a Veto account with your email')
    expect(englishHtml).toContain('Veto Cloud')
    expect(chineseHtml).toContain('lang="zh-CN"')
    expect(chineseHtml).toContain('使用邮箱登录或注册 Veto 账号')
    const [englishPage, chinesePage] = await Promise.all([english.newPage(), chinese.newPage()])
    await Promise.all([englishPage.goto(`${base}/login`), chinesePage.goto(`${base}/login`)])
    await expect(englishPage.getByLabel('Email', { exact: true })).toBeVisible()
    await expect(chinesePage.getByLabel('邮箱', { exact: true })).toBeVisible()
    await englishPage.getByRole('combobox', { name: 'Interface language' }).selectOption('zh-CN')
    await expect(chinesePage.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(chinesePage.getByLabel('邮箱', { exact: true })).toBeVisible()
  } finally {
    await Promise.all([english.close(), chinese.close()])
  }
})

test('language switching retains login input and the document without navigation', async ({
  page
}) => {
  await page.goto(`${base}/login`)
  await page.getByLabel('邮箱', { exact: true }).fill('draft@example.test')
  await page.getByLabel('密码', { exact: true }).fill('unsaved-password')
  await page.evaluate(() => {
    ;(window as Window & { i18nDocument?: string }).i18nDocument = 'same-document'
  })
  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++
  })
  await page.getByRole('combobox', { name: '界面语言' }).selectOption('en-US')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('draft@example.test')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('unsaved-password')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page).toHaveTitle('Log in | Veto Cloud')
  expect(
    await page.evaluate(() => (window as Window & { i18nDocument?: string }).i18nDocument)
  ).toBe('same-document')
  expect(navigations).toBe(0)
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === 'veto-locale')?.value
  ).toBe('en-US')
  await page.reload()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
})

test('conference drafts, selected tab, user content and timeline edits survive switching', async ({
  page
}) => {
  await authenticate(page)
  let requests = 0
  await page.route('**/v1/conferences/i18n', (route) => {
    requests++
    return route.fulfill({ json: { ok: true, conference } })
  })
  await page.goto(`${base}/conferences/i18n`)
  await page.getByRole('tab', { name: '大会设置', exact: true }).click()
  await page.getByLabel('大会名称', { exact: true }).fill('尚未保存的名字')
  await page.getByLabel('大会说明', { exact: true }).fill('尚未保存的说明')
  const before = requests
  await page.getByRole('combobox', { name: '界面语言' }).selectOption('en-US')
  await expect(page.getByRole('tab', { name: 'Conference settings', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByLabel('Conference name', { exact: true })).toHaveValue('尚未保存的名字')
  await expect(page.getByLabel('Conference description', { exact: true })).toHaveValue(
    '尚未保存的说明'
  )
  await expect(page.getByRole('heading', { name: '用户原文大会', exact: true })).toBeVisible()
  await expect(page.getByText('用户原文姓名', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save basic information', exact: true })
  ).toBeVisible()
  expect(requests).toBe(before)
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh-CN')
  await expect(page.getByLabel('大会名称', { exact: true })).toHaveValue('尚未保存的名字')
})

test('account draft and password validation update in place', async ({ page }) => {
  await authenticate(page)
  await page.goto(`${base}/account`)
  await page.getByLabel('用户名', { exact: true }).fill('尚未保存用户')
  await page.getByLabel('新密码', { exact: true }).fill('new-password')
  await page.getByLabel('确认新密码', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(page.getByText('两次输入的密码不一致', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: '界面语言' }).selectOption('en-US')
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('尚未保存用户')
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('new-password')
  await expect(page.getByText('Passwords do not match', { exact: true })).toBeVisible()
})

test('desktop language events override a stale initialization snapshot', async ({ page }) => {
  await page.addInitScript(() => {
    let listener: ((locale: string) => void) | undefined
    let snapshot: ((locale: string) => void) | undefined
    const target = window as Window & {
      veto?: unknown
      languageEvent?: (locale: string) => void
      resolveLanguage?: (locale: string) => void
      savedLanguage?: string
    }
    target.veto = {
      i18n: {
        getLocale: () =>
          new Promise<string>((resolve) => {
            snapshot = resolve
          }),
        setLocale: async (locale: string) => {
          target.savedLanguage = locale
        },
        onLocaleChanged: (callback: (locale: string) => void) => {
          listener = callback
          return () => {
            listener = undefined
          }
        }
      }
    }
    target.languageEvent = (locale) => listener?.(locale)
    target.resolveLanguage = (locale) => snapshot?.(locale)
  })
  await page.goto(`${base}/login`)
  await page.getByLabel('邮箱', { exact: true }).fill('desktop-draft@example.test')
  await page.evaluate(() =>
    (window as Window & { languageEvent: (locale: string) => void }).languageEvent('en-US')
  )
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('desktop-draft@example.test')
  await page.evaluate(() =>
    (window as Window & { resolveLanguage: (locale: string) => void }).resolveLanguage('zh-CN')
  )
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh-CN')
  expect(
    await page.evaluate(() => (window as Window & { savedLanguage?: string }).savedLanguage)
  ).toBe('zh-CN')
})
