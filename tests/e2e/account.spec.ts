import { test, expect } from '@playwright/test'

test('桌面账号设置：登录、恢复、刷新与退出同步用户卡片', async ({ page }) => {
  await page.addInitScript(() => {
    const empty = { user: null, persistent: false, warning: null }
    let session = JSON.parse(sessionStorage.getItem('test-account') ?? 'null') ?? empty
    const listeners = new Set<(snapshot: typeof session) => void>()
    const update = (next: typeof session) => {
      session = next
      sessionStorage.setItem('test-account', JSON.stringify(next))
      for (const listener of listeners) listener(next)
      return { ok: true as const, session }
    }
    Object.assign(window, {
      electron: { ipcRenderer: { send() {} } },
      veto: {
        account: {
          getSession: async () => ({ ok: true as const, session }),
          login: async (_email: string, password: string) =>
            password === 'wrong'
              ? { ok: false as const, error: '邮箱或密码错误', status: 401 }
              : update({
                  user: {
                    name: '测试用户',
                    email: 'test@example.test',
                    avatar: '',
                    organization: '测试模联'
                  },
                  persistent: true,
                  warning: null
                }),
          refresh: async () => update({ ...session, user: { ...session.user, name: '更新用户' } }),
          signOut: async () => update(empty),
          onChanged: (listener: (snapshot: typeof session) => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          }
        }
      }
    })
  })
  await page.goto('http://localhost:4173/conference')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '账号设置', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: '登录 Veto' })).toBeVisible()
  await dialog.getByLabel('邮箱', { exact: true }).fill('test@example.test')
  await dialog.getByLabel('密码', { exact: true }).fill('wrong')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('邮箱或密码错误')
  await expect(dialog.getByLabel('密码', { exact: true })).toHaveValue('')
  await dialog.getByLabel('密码', { exact: true }).fill('password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('测试用户')
  await expect(dialog.getByText('测试模联')).toBeVisible()
  await dialog.getByRole('button', { name: '刷新账号信息' }).click()
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('更新用户')
  await page.reload()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await dialog.getByRole('button', { name: '账号设置' }).click()
  await expect(dialog.getByRole('heading', { name: '当前账号' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('account-settings.png') })
  await dialog.getByRole('button', { name: '退出登录' }).click()
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('未登录')
  await expect(dialog.getByRole('heading', { name: '登录 Veto' })).toBeVisible()
})
