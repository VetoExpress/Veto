import { test, expect } from '@playwright/test'

test('云平台账号：资料、共享头像压缩、验证码重置和退出', async ({ page }) => {
  let user = {
    name: '平台用户',
    email: 'test@example.test',
    organization: '测试模联',
    avatar: '',
    created_at: '2026-10-05T00:00:00Z'
  }
  let avatarBytes = 0
  let resetEmail = ''
  await page.addInitScript(() => localStorage.setItem('veto_token', 'account-token'))
  await page.route('**/v1/auth/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      if (body.name === '保存失败') {
        await route.fulfill({ status: 500, json: { ok: false, error: '保存失败，请重试' } })
        return
      }
      if (body.avatar) {
        avatarBytes = Buffer.from(body.avatar, 'base64').length
        user = { ...user, avatar: 'http://localhost:4174/v1/auth/avatars/test.png' }
      }
      user = { ...user, name: body.name ?? user.name }
    }
    await route.fulfill({ json: { ok: true, user } })
  })
  await page.route('**/v1/auth/avatars/test.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64'
      )
    })
  )
  await page.route('**/v1/auth/forgot-password', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: user.email })
    await route.fulfill({ json: { ok: true } })
  })
  await page.route('**/v1/auth/reset-password', async (route) => {
    const body = route.request().postDataJSON()
    resetEmail = body.email
    await route.fulfill({
      status: body.code === '123456' ? 200 : 400,
      json: body.code === '123456' ? { ok: true } : { ok: false, error: '验证码错误' }
    })
  })
  await page.goto('http://localhost:4174/account')
  await expect(page.getByRole('heading', { name: '个人信息' })).toBeVisible()
  await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue(user.email)
  await expect(page.getByLabel('所属模联')).toHaveValue(user.organization)
  await page.getByLabel('用户名').fill('保存失败')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '保存失败' })).toBeVisible()
  await expect(page.getByLabel('用户名')).toHaveValue('保存失败')
  await page.getByLabel('用户名').fill('新的平台用户')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByRole('heading', { name: '新的平台用户', exact: true })).toBeVisible()
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 640
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(640, 640)
    let seed = 42
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        pixels.data[i + j] = seed >>> 24
      }
      pixels.data[i + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.3).split(',')[1]
  })
  await page
    .locator('#platform-avatar-upload')
    .setInputFiles({
      name: 'avatar.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64')
    })
  const dialog = page.getByRole('dialog', { name: '裁剪头像' })
  await expect(dialog).toBeVisible()
  await expect
    .poll(() =>
      dialog
        .locator('canvas')
        .evaluate(
          (canvas) =>
            (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(128, 128, 1, 1).data[3]
        )
    )
    .toBe(255)
  await dialog.getByRole('button', { name: '裁剪', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByRole('status')).toContainText('个人信息已更新')
  expect(avatarBytes).toBeGreaterThan(0)
  expect(avatarBytes).toBeLessThanOrEqual(512 * 1024)
  await expect(page.getByRole('button', { name: '更换头像' }).locator('img')).toHaveAttribute(
    'src',
    user.avatar
  )
  await page.screenshot({ path: test.info().outputPath('platform-account.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(page.getByRole('button', { name: /秒后重发/ })).toBeDisabled()
  await page.getByLabel('新密码', { exact: true }).fill('new-password')
  await page.getByLabel('确认新密码', { exact: true }).fill('different')
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '两次输入的密码不一致' })).toBeVisible()
  await page.getByLabel('确认新密码', { exact: true }).fill('new-password')
  await page.getByLabel('邮箱验证码').fill('000000')
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '验证码错误' })).toBeVisible()
  await expect(page.getByLabel('新密码', { exact: true })).toHaveValue('new-password')
  await page.getByLabel('邮箱验证码').fill('123456')
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(resetEmail).toBe(user.email)
  expect(await page.evaluate(() => localStorage.getItem('veto_token'))).toBeNull()
})
