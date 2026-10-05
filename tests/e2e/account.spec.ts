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
                    organization: '测试模联',
                    created_at: '2026-10-05T00:00:00Z'
                  },
                  persistent: true,
                  warning: null
                }),
          refresh: async () => update({ ...session, user: { ...session.user, name: '更新用户' } }),
          updateProfile: async (body: { name?: string; avatar?: string; password?: string }) =>
            body.name === '保存失败'
              ? { ok: false as const, error: '服务暂不可用' }
              : update({
                  ...session,
                  user: {
                    ...session.user,
                    ...(body.name ? { name: body.name } : {}),
                    ...(body.avatar ? { avatar: `data:image/png;base64,${body.avatar}` } : {})
                  }
                }),
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
  await expect(dialog.getByLabel('所属模联')).toHaveValue('测试模联')
  await expect(dialog.getByText('2026年10月5日')).toBeVisible()
  await dialog.getByLabel('用户名').fill('保存失败')
  await dialog.getByRole('button', { name: '保存修改' }).click()
  await expect(dialog.getByRole('alert').filter({ hasText: '服务暂不可用' }).first()).toBeVisible()
  await expect(dialog.getByLabel('用户名')).toHaveValue('保存失败')
  await dialog.getByLabel('用户名').fill('修改用户')
  await dialog.getByRole('button', { name: '保存修改' }).click()
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('修改用户')
  const avatar = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = '#008080'
    context.fillRect(0, 0, 64, 64)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await dialog.locator('#account-avatar-upload').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(avatar, 'base64')
  })
  const cropDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '裁剪头像' }) })
  await expect(cropDialog).toBeVisible()
  await cropDialog.getByRole('button', { name: 'Crop', exact: true }).click()
  await expect(cropDialog).not.toBeVisible()
  await dialog.getByRole('button', { name: '保存修改' }).click()
  await expect(dialog.getByText('个人信息已更新', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '更换头像' }).locator('img')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/
  )
  await dialog.getByLabel('新密码', { exact: true }).fill('new-password')
  await dialog.getByLabel('确认新密码', { exact: true }).fill('different')
  await dialog.getByRole('button', { name: '修改密码', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('两次输入的密码不一致')
  await dialog.getByLabel('确认新密码', { exact: true }).fill('new-password')
  await dialog.getByRole('button', { name: '修改密码', exact: true }).click()
  await expect(dialog.getByLabel('新密码', { exact: true })).toHaveValue('')
  await expect(dialog.getByText('密码已修改', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '刷新账号信息' }).click()
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('更新用户')
  await page.reload()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await dialog.getByRole('button', { name: '账号设置' }).click()
  await expect(dialog.getByRole('heading', { name: '个人信息' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('account-settings.png') })
  await dialog.getByRole('button', { name: '退出登录' }).click()
  await expect(dialog.getByRole('button', { name: '账号设置' })).toContainText('未登录')
  await expect(dialog.getByRole('heading', { name: '登录 Veto' })).toBeVisible()
})
