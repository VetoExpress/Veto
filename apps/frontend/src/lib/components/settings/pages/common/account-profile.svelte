<script lang="ts">
  import { User, Camera, LogOut, RefreshCw, Check, ShieldCheck, CircleCheck } from '@lucide/svelte'
  import type { AuthUser } from '@vetoexpress/auth'
  import { prepareAvatarUpload } from '@vetoexpress/auth/avatar'
  import * as Card from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import * as Avatar from '$lib/components/ui/avatar'
  import * as ImageCropper from '$lib/components/ui/image-cropper'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Field from '$lib/components/ui/field'
  import * as Alert from '$lib/components/ui/alert'

  let {
    user,
    pending = false,
    onRefresh,
    onSignOut,
    onSave,
    onPassword,
    onSendPasswordCode
  }: {
    user: AuthUser
    pending?: boolean
    onRefresh: () => void
    onSignOut: () => void
    onSave?: (name: string, avatar?: string) => Promise<void>
    onPassword?: (code: string, password: string) => Promise<void>
    onSendPasswordCode?: () => Promise<void>
  } = $props()

  let editName = $state('')
  let avatarSrc = $state('')
  let avatarData = $state<string>()
  let newPassword = $state('')
  let confirmPassword = $state('')
  let passwordCode = $state('')
  let sendingCode = $state(false)
  let cooldownUntil = $state(0)
  let cooldown = $state(0)
  let saving = $state(false)
  let processingAvatar = $state(false)
  let error = $state('')
  let message = $state('')
  const savedName = $derived(user.name)
  const savedAvatar = $derived(user.avatar)
  const accountEmail = $derived(user.email)

  $effect(() => {
    const deadline = cooldownUntil
    if (!deadline) return
    cooldown = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    const timer = setInterval(() => {
      cooldown = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      if (!cooldown) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  })

  async function sendPasswordCode() {
    if (!onSendPasswordCode || sendingCode || pending || cooldown) return
    sendingCode = true
    error = ''
    message = ''
    try {
      await onSendPasswordCode()
      cooldownUntil = Date.now() + 60_000
      message = '验证码已发送到注册邮箱，5 分钟内有效'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : '验证码发送失败'
    } finally {
      sendingCode = false
    }
  }

  $effect(() => {
    accountEmail
    editName = savedName
  })
  $effect(() => {
    accountEmail
    avatarSrc = savedAvatar
    avatarData = undefined
  })

  async function cropped(src: string) {
    processingAvatar = true
    error = ''
    message = ''
    try {
      const upload = await prepareAvatarUpload(src)
      avatarSrc = upload.dataUrl
      avatarData = upload.base64
    } catch (caught) {
      avatarSrc = user.avatar
      avatarData = undefined
      error = caught instanceof Error ? caught.message : '无法读取头像'
    } finally {
      processingAvatar = false
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
    }
  }

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault()
    if (saving || pending || processingAvatar) return
    error = ''
    message = ''
    if (!editName.trim()) {
      error = '请填写用户名'
      return
    }
    if (editName.trim() === user.name && !avatarData) {
      message = '没有需要保存的更改'
      return
    }
    if (!onSave) return
    saving = true
    try {
      await onSave(editName.trim(), avatarData)
      avatarData = undefined
      message = '个人信息已更新'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : '保存失败'
    } finally {
      saving = false
    }
  }

  async function changePassword(event: SubmitEvent) {
    event.preventDefault()
    if (saving || pending) return
    error = ''
    message = ''
    if (newPassword.length < 6 || newPassword.length > 1024) {
      error = '密码应为 6–1024 个字符'
      return
    }
    if (newPassword !== confirmPassword) {
      error = '两次输入的密码不一致'
      return
    }
    if (!onPassword) return
    if (!/^\d{6}$/.test(passwordCode.trim())) {
      error = '请输入邮箱收到的 6 位验证码'
      return
    }
    saving = true
    try {
      await onPassword(passwordCode.trim(), newPassword)
      passwordCode = ''
      newPassword = ''
      confirmPassword = ''
      message = '密码已重置，请使用新密码重新登录'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : '修改密码失败'
    } finally {
      saving = false
    }
  }
</script>

<div class="@container/profile flex flex-col gap-5">
  {#if error}
    <Alert.Root variant="destructive">
      <Alert.Title>操作失败</Alert.Title>
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if message}
    <Alert.Root role="status">
      <CircleCheck />
      <Alert.Title>{message}</Alert.Title>
    </Alert.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <div class="flex flex-wrap items-center gap-4">
        <ImageCropper.Root
          id="account-avatar-upload"
          bind:src={avatarSrc}
          onCropped={cropped}
          onUnsupportedFile={() => (error = '请选择支持的图片文件。')}
          accept="image/*"
          disabled={!onSave || saving || pending}
        >
          <ImageCropper.Preview>
            {#snippet child({ src })}
              <Button
                variant="ghost"
                class="group relative size-20 rounded-full p-0"
                aria-label="更换头像"
                disabled={!onSave || saving || pending}
                onclick={() => document.getElementById('account-avatar-upload')?.click()}
              >
                <Avatar.Root class="size-20">
                  {#if src}<Avatar.Image {src} alt={user.name} />{/if}
                  <Avatar.Fallback><User /></Avatar.Fallback>
                </Avatar.Root>
                <span
                  class="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <Camera />
                </span>
              </Button>
            {/snippet}
          </ImageCropper.Preview>
          <ImageCropper.Dialog>
            <Dialog.Title>裁剪头像</Dialog.Title>
            <Dialog.Description>拖动和缩放图片，裁剪为圆形头像。</Dialog.Description>
            <ImageCropper.Cropper cropShape="round" aspect={1} />
            <ImageCropper.Controls>
              <ImageCropper.Cancel /><ImageCropper.Crop />
            </ImageCropper.Controls>
          </ImageCropper.Dialog>
        </ImageCropper.Root>
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="break-all text-xl font-semibold">{user.name}</h3>
            <Badge variant="secondary"><Check data-icon="inline-start" />已登录</Badge>
          </div>
          <p class="break-all text-sm text-muted-foreground">{user.email}</p>
          <p class="text-xs text-muted-foreground">
            点击头像更换图片，裁剪后自动压缩 · 最大 512 KB
          </p>
        </div>
      </div>
    </Card.Header>
  </Card.Root>

  <form id="account-profile-form" onsubmit={saveProfile}>
    <Card.Root>
      <Card.Header>
        <Card.Title role="heading" aria-level={3}>个人信息</Card.Title>
        <Card.Description>管理你的显示名称和账号资料。</Card.Description>
      </Card.Header>
      <Card.Content>
        <Field.FieldGroup class="gap-5">
          <Field.Field data-disabled={!onSave || saving || pending}>
            <Field.FieldLabel for="account-name">用户名</Field.FieldLabel>
            <Input
              id="account-name"
              bind:value={editName}
              maxlength={200}
              placeholder="输入用户名"
              disabled={!onSave || saving || pending}
            />
            <Field.FieldDescription>用于展示你的身份，最多 200 个字符。</Field.FieldDescription>
          </Field.Field>
          <Field.FieldGroup class="@min-[480px]/profile:flex-row">
            <Field.Field>
              <Field.FieldLabel for="account-profile-email">邮箱</Field.FieldLabel>
              <Input id="account-profile-email" value={user.email} readonly />
              <Field.FieldDescription>注册邮箱，暂不支持修改。</Field.FieldDescription>
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="account-organization">所属模联</Field.FieldLabel>
              <Input id="account-organization" value={user.organization} readonly />
              <Field.FieldDescription>你的账号所属模联。</Field.FieldDescription>
            </Field.Field>
          </Field.FieldGroup>
        </Field.FieldGroup>
      </Card.Content>
      <Card.Footer class="flex-wrap justify-between gap-3 border-t pt-5">
        <p class="text-xs text-muted-foreground">
          {#if user.created_at}
            注册于 {new Date(user.created_at).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          {:else}
            头像与用户名将在保存后更新。
          {/if}
        </p>
        <Button type="submit" disabled={!onSave || saving || pending || processingAvatar}>
          {#if saving || processingAvatar}<Spinner data-icon="inline-start" />{/if}保存修改
        </Button>
      </Card.Footer>
    </Card.Root>
  </form>

  <form id="account-password-form" onsubmit={changePassword}>
    <Card.Root>
      <Card.Header>
        <Card.Title role="heading" aria-level={3}>安全设置</Card.Title>
        <Card.Description>通过注册邮箱的验证码重置密码。</Card.Description>
        <Card.Action><ShieldCheck class="size-5 text-muted-foreground" /></Card.Action>
      </Card.Header>
      <Card.Content>
        <Field.Field class="mb-5" data-disabled={!onPassword || saving || pending}>
          <Field.FieldLabel for="account-password-code">邮箱验证码</Field.FieldLabel>
          <div class="flex gap-2">
            <Input
              id="account-password-code"
              bind:value={passwordCode}
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength={6}
              placeholder="6 位验证码"
              disabled={!onPassword || saving || pending}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!onSendPasswordCode || saving || sendingCode || pending || cooldown > 0}
              onclick={sendPasswordCode}
            >
              {sendingCode ? '发送中…' : cooldown ? `${cooldown} 秒后重发` : '发送验证码'}
            </Button>
          </div>
          <Field.FieldDescription>
            验证码将发送至 {user.email}，5 分钟内有效。
          </Field.FieldDescription>
        </Field.Field>
        <Field.FieldGroup class="@min-[480px]/profile:flex-row">
          <Field.Field data-disabled={!onPassword || saving || pending}>
            <Field.FieldLabel for="account-new-password">新密码</Field.FieldLabel>
            <Input
              id="account-new-password"
              type="password"
              autocomplete="new-password"
              bind:value={newPassword}
              placeholder="至少 6 位字符"
              disabled={!onPassword || saving || pending}
            />
          </Field.Field>
          <Field.Field data-disabled={!onPassword || saving || pending}>
            <Field.FieldLabel for="account-confirm-password">确认新密码</Field.FieldLabel>
            <Input
              id="account-confirm-password"
              type="password"
              autocomplete="new-password"
              bind:value={confirmPassword}
              placeholder="再次输入新密码"
              disabled={!onPassword || saving || pending}
            />
          </Field.Field>
        </Field.FieldGroup>
      </Card.Content>
      <Card.Footer class="flex-wrap justify-between gap-3 border-t pt-5">
        <p class="text-xs text-muted-foreground">重置后，所有设备需使用新密码重新登录。</p>
        <Button
          type="submit"
          variant="outline"
          disabled={!onPassword || saving || pending || !newPassword || !confirmPassword}
        >
          重置密码
        </Button>
      </Card.Footer>
    </Card.Root>
  </form>

  <Card.Root>
    <Card.Header>
      <Card.Title role="heading" aria-level={3}>登录状态</Card.Title>
      <Card.Description>退出后，本机 App 与内嵌云平台会同步退出。</Card.Description>
    </Card.Header>
    <Card.Footer class="flex-wrap gap-2">
      <Button variant="outline" disabled={saving || pending} onclick={onRefresh}>
        <RefreshCw data-icon="inline-start" />刷新账号信息
      </Button>
      <Button variant="destructive" disabled={saving || pending} onclick={onSignOut}>
        <LogOut data-icon="inline-start" />退出登录
      </Button>
    </Card.Footer>
  </Card.Root>
</div>
