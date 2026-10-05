import { test, expect, type Page } from '@playwright/test'

async function desktopSession(page: Page) {
  let token: string | null = null
  let user: { name: string; email: string; avatar: string; organization: string } | null = null
  await page.exposeFunction('testAccountRpc', (method: string, args: string[]) => {
    if (method === 'login') {
      token = `account-${args[0]}`
      user = {
        name: args[0].startsWith('app') ? 'App 用户' : '平台用户',
        email: args[0],
        avatar: '',
        organization: '测试模联'
      }
    }
    if (method === 'signOut' && (!args[0] || token === args[0])) {
      token = null
      user = null
    }
    return { ok: true, token, session: { user, persistent: !!token, warning: null } }
  })
  await page.addInitScript(() => {
    const runtime = window as typeof window & {
      testAccountRpc(
        method: string,
        args: string[]
      ): Promise<{ ok: true; token: string | null; session: unknown }>
    }
    const listeners = new Set<(session: unknown) => void>()
    async function call(method: string, ...args: string[]) {
      const result = await runtime.testAccountRpc(method, args)
      if (method === 'login' || method === 'signOut')
        for (const listener of listeners) listener(result.session)
      return result
    }
    Object.assign(window, {
      electron: { ipcRenderer: { send() {} } },
      veto: {
        account: {
          getSession: () => call('getSession'),
          getAccessToken: () => call('getAccessToken'),
          login: (email: string, password: string) => call('login', email, password),
          adoptToken: () => call('adoptToken'),
          refresh: () => call('refresh'),
          signOut: (expected?: string) => call('signOut', expected ?? ''),
          onChanged: (listener: (session: unknown) => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          }
        }
      }
    })
  })
  await page.route('**/v1/conferences?*', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`)
    await route.fulfill({ json: { ok: true, conferences: [], nextCursor: null } })
  })
}

async function appAccount(page: Page) {
  await page.goto('http://localhost:4173/conference')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '账号设置', exact: true }).click()
  return page.getByRole('dialog')
}

test('App 登录后平台自动登录，平台退出后 App 同步退出', async ({ page }) => {
  await desktopSession(page)
  let dialog = await appAccount(page)
  await dialog.getByLabel('邮箱', { exact: true }).fill('app@example.test')
  await dialog.getByLabel('密码', { exact: true }).fill('password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('App 用户')
  await page.goto('http://localhost:4174/login?from=app')
  await expect(page).toHaveURL('http://localhost:4174/')
  await expect(page.getByRole('link', { name: '用户 App 用户' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('veto_token'))).toBeNull()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL('http://localhost:4174/login')
  dialog = await appAccount(page)
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('未登录')
})

test('平台登录后 App 自动登录，App 退出后平台保持退出', async ({ page }) => {
  await desktopSession(page)
  await page.goto('http://localhost:4174/login?from=app')
  await page.getByLabel('邮箱', { exact: true }).fill('platform@example.test')
  await page.getByLabel('密码', { exact: true }).fill('password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL('http://localhost:4174/')
  expect(await page.evaluate(() => localStorage.getItem('veto_token'))).toBeNull()
  const dialog = await appAccount(page)
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('平台用户')
  await dialog.getByRole('button', { name: '退出登录' }).click()
  await page.goto('http://localhost:4174/')
  await expect(page).toHaveURL('http://localhost:4174/login')
})
