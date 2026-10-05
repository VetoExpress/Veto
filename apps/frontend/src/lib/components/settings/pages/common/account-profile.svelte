<script lang="ts">
  import { User, Camera, LogOut, RefreshCw } from '@lucide/svelte'
  import type { AuthUser } from '@vetoexpress/auth'
  import SettingCard from '../../settings-card.svelte'
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
    onPassword
  }: {
    user: AuthUser
    pending?: boolean
    onRefresh: () => void
    onSignOut: () => void
    onSave?: (name: string, avatar?: string) => Promise<void>
    onPassword?: (password: string) => Promise<void>
  } = $props()

  const MAX_AVATAR_BYTES = 512 * 1024
  let editName = $state('')
  let avatarSrc = $state('')
  let avatarData = $state<string>()
  let newPassword = $state('')
  let confirmPassword = $state('')
  let saving = $state(false)
  let processingAvatar = $state(false)
  let error = $state('')
  let message = $state('')
  const savedName = $derived(user.name)
  const savedAvatar = $derived(user.avatar)
  const accountEmail = $derived(user.email)

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
      const blob = await (await fetch(src)).blob()
      if (blob.size > MAX_AVATAR_BYTES)
        throw new Error('裁剪后的头像不能超过 512 KB，请选择更小的图片。')
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('无法读取头像，请重新选择。'))
        reader.readAsDataURL(blob)
      })
      avatarSrc = data
      avatarData = data.split(',')[1]
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
    saving = true
    try {
      await onPassword(newPassword)
      newPassword = ''
      confirmPassword = ''
      message = '密码已修改'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : '修改密码失败'
    } finally {
      saving = false
    }
  }
</script>

<div class="flex flex-col gap-8">
  {#if error}<Alert.Root variant="destructive">
      <Alert.Title>操作失败</Alert.Title><Alert.Description>{error}</Alert.Description>
    </Alert.Root>{/if}
  {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}

  <section class="flex flex-col gap-4" aria-labelledby="account-avatar-title">
    <div>
      <h3 id="account-avatar-title" class="text-xl font-bold">头像</h3>
      <p class="mt-1 text-sm text-muted-foreground">点击头像更换，支持裁剪。最大 512 KB。</p>
    </div>
    <div class="flex justify-center">
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
              class="group relative size-24 rounded-full p-0"
              aria-label="更换头像"
              disabled={!onSave || saving || pending}
              onclick={() => document.getElementById('account-avatar-upload')?.click()}
            >
              <Avatar.Root class="size-24">
                {#if src}<Avatar.Image {src} alt={user.name} />{/if}
                <Avatar.Fallback><User class="size-8" /></Avatar.Fallback>
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
    </div>
  </section>

  <section class="flex flex-col gap-4" aria-labelledby="account-profile-title">
    <h3 id="account-profile-title" class="text-xl font-bold">个人信息</h3>
    <form class="flex flex-col gap-4" onsubmit={saveProfile}>
      <Field.FieldGroup class="gap-3">
        <SettingCard title="用户名" description="修改你的显示名称。" let:id>
          <Input
            {id}
            class="max-w-[220px]"
            bind:value={editName}
            maxlength={200}
            placeholder="输入用户名"
            disabled={!onSave || saving || pending}
          />
        </SettingCard>
        <SettingCard title="邮箱" description="注册邮箱，暂不支持修改。" let:id>
          <Input {id} class="max-w-[280px]" value={user.email} readonly />
        </SettingCard>
        <SettingCard title="所属模联" description="你的账号所属模联。" let:id>
          <Input {id} class="max-w-[280px]" value={user.organization} readonly />
        </SettingCard>
        {#if user.created_at}
          <SettingCard title="注册时间" description="你的账号注册时间。">
            <span class="text-sm text-muted-foreground">
              {new Date(user.created_at).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </SettingCard>
        {/if}
      </Field.FieldGroup>
      <div>
        <Button type="submit" disabled={!onSave || saving || pending || processingAvatar}>
          {#if saving || processingAvatar}<Spinner data-icon="inline-start" />{/if}保存修改
        </Button>
      </div>
    </form>
  </section>

  <section class="flex flex-col gap-4" aria-labelledby="account-security-title">
    <h3 id="account-security-title" class="text-xl font-bold">安全设置</h3>
    <form class="flex flex-col gap-4" onsubmit={changePassword}>
      <SettingCard title="修改密码" description="设置新密码，至少 6 位。">
        <Field.FieldGroup class="max-w-[220px] gap-2">
          <Field.Field>
            <Field.FieldLabel class="sr-only" for="account-new-password">
              新密码
            </Field.FieldLabel><Input
              id="account-new-password"
              type="password"
              autocomplete="new-password"
              bind:value={newPassword}
              placeholder="新密码"
              disabled={!onPassword || saving || pending}
            />
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel class="sr-only" for="account-confirm-password">
              确认新密码
            </Field.FieldLabel><Input
              id="account-confirm-password"
              type="password"
              autocomplete="new-password"
              bind:value={confirmPassword}
              placeholder="确认新密码"
              disabled={!onPassword || saving || pending}
            />
          </Field.Field>
        </Field.FieldGroup>
      </SettingCard>
      <div>
        <Button
          type="submit"
          variant="outline"
          disabled={!onPassword || saving || pending || !newPassword || !confirmPassword}
        >
          修改密码
        </Button>
      </div>
    </form>
  </section>

  <section class="flex flex-col gap-4" aria-labelledby="account-session-title">
    <h3 id="account-session-title" class="text-xl font-bold">登录状态</h3>
    <SettingCard title="当前账号" description="退出后，本机 App 与内嵌云平台会同步退出。">
      <div class="flex gap-2">
        <Button variant="outline" disabled={saving || pending} onclick={onRefresh}>
          <RefreshCw data-icon="inline-start" />刷新账号信息
        </Button>
        <Button variant="destructive" disabled={saving || pending} onclick={onSignOut}>
          <LogOut data-icon="inline-start" />退出登录
        </Button>
      </div>
    </SettingCard>
  </section>
</div>
