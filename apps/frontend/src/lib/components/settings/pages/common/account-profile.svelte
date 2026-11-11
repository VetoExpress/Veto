<script lang="ts">
  import { messageText, type LocalizedMessage } from '$lib/components/ui/localized-message'
  import { t, formatDate } from '$lib/i18n'
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
  let error = $state<LocalizedMessage>('')
  let message = $state<LocalizedMessage>('')
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
      message = () => t('settings_code_sent')
    } catch (caught) {
      error = caught instanceof Error ? caught.message : () => t('settings_code_failed')
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
      error = caught instanceof Error ? caught.message : () => t('settings_avatar_failed')
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
      error = () => t('settings_name_required')
      return
    }
    if (editName.trim() === user.name && !avatarData) {
      message = () => t('settings_no_changes')
      return
    }
    if (!onSave) return
    saving = true
    try {
      await onSave(editName.trim(), avatarData)
      avatarData = undefined
      message = () => t('settings_profile_updated')
    } catch (caught) {
      error = caught instanceof Error ? caught.message : () => t('settings_save_failed')
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
      error = () => t('settings_password_length')
      return
    }
    if (newPassword !== confirmPassword) {
      error = () => t('settings_password_mismatch')
      return
    }
    if (!onPassword) return
    if (!/^\d{6}$/.test(passwordCode.trim())) {
      error = () => t('settings_code_required')
      return
    }
    saving = true
    try {
      await onPassword(passwordCode.trim(), newPassword)
      passwordCode = ''
      newPassword = ''
      confirmPassword = ''
      message = () => t('settings_password_reset_success')
    } catch (caught) {
      error = caught instanceof Error ? caught.message : () => t('settings_password_failed')
    } finally {
      saving = false
    }
  }
</script>

<div class="@container/profile flex flex-col gap-5">
  {#if error}
    <Alert.Root variant="destructive">
      <Alert.Title>{t('settings_operation_failed')}</Alert.Title>
      <Alert.Description>{messageText(error)}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if message}
    <Alert.Root role="status">
      <CircleCheck />
      <Alert.Title>{messageText(message)}</Alert.Title>
    </Alert.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <div class="flex flex-wrap items-center gap-4">
        <ImageCropper.Root
          id="account-avatar-upload"
          bind:src={avatarSrc}
          onCropped={cropped}
          onUnsupportedFile={() => (error = () => t('settings_image_unsupported'))}
          accept="image/*"
          disabled={!onSave || saving || pending}
        >
          <ImageCropper.Preview>
            {#snippet child({ src })}
              <Button
                variant="ghost"
                class="group relative size-20 rounded-full p-0"
                aria-label={t('settings_avatar_change')}
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
            <Dialog.Title>{t('settings_avatar_crop')}</Dialog.Title>
            <Dialog.Description>{t('settings_avatar_crop_description')}</Dialog.Description>
            <ImageCropper.Cropper cropShape="round" aspect={1} />
            <ImageCropper.Controls>
              <ImageCropper.Cancel /><ImageCropper.Crop />
            </ImageCropper.Controls>
          </ImageCropper.Dialog>
        </ImageCropper.Root>
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="break-all text-xl font-semibold">{user.name}</h3>
            <Badge variant="secondary"><Check data-icon="inline-start" />{t('settings_signed_in')}</Badge>
          </div>
          <p class="break-all text-sm text-muted-foreground">{user.email}</p>
          <p class="text-xs text-muted-foreground">
            {t('settings_avatar_hint')}
          </p>
        </div>
      </div>
    </Card.Header>
  </Card.Root>

  <form id="account-profile-form" onsubmit={saveProfile}>
    <Card.Root>
      <Card.Header>
        <Card.Title role="heading" aria-level={3}>{t('settings_profile')}</Card.Title>
        <Card.Description>{t('settings_profile_description')}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Field.FieldGroup class="gap-5">
          <Field.Field data-disabled={!onSave || saving || pending}>
            <Field.FieldLabel for="account-name">{t('settings_username')}</Field.FieldLabel>
            <Input
              id="account-name"
              bind:value={editName}
              maxlength={200}
              placeholder={t('settings_username_placeholder')}
              disabled={!onSave || saving || pending}
            />
            <Field.FieldDescription>{t('settings_username_hint')}</Field.FieldDescription>
          </Field.Field>
          <Field.FieldGroup class="@min-[480px]/profile:flex-row">
            <Field.Field>
              <Field.FieldLabel for="account-profile-email">{t('settings_email')}</Field.FieldLabel>
              <Input id="account-profile-email" value={user.email} readonly />
              <Field.FieldDescription>{t('settings_email_readonly')}</Field.FieldDescription>
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="account-organization">{t('settings_organization')}</Field.FieldLabel>
              <Input id="account-organization" value={user.organization} readonly />
              <Field.FieldDescription>{t('settings_organization_hint')}</Field.FieldDescription>
            </Field.Field>
          </Field.FieldGroup>
        </Field.FieldGroup>
      </Card.Content>
      <Card.Footer class="flex-wrap justify-between gap-3 border-t pt-5">
        <p class="text-xs text-muted-foreground">
          {#if user.created_at}
            {t('settings_registered_on', { date: formatDate(user.created_at, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }) })}
          {:else}
            {t('settings_profile_save_hint')}
          {/if}
        </p>
        <Button type="submit" disabled={!onSave || saving || pending || processingAvatar}>
          {#if saving || processingAvatar}<Spinner data-icon="inline-start" />{/if}{t('settings_save_changes')}
        </Button>
      </Card.Footer>
    </Card.Root>
  </form>

  <form id="account-password-form" onsubmit={changePassword}>
    <Card.Root>
      <Card.Header>
        <Card.Title role="heading" aria-level={3}>{t('settings_security')}</Card.Title>
        <Card.Description>{t('settings_security_description')}</Card.Description>
        <Card.Action><ShieldCheck class="size-5 text-muted-foreground" /></Card.Action>
      </Card.Header>
      <Card.Content>
        <Field.Field class="mb-5" data-disabled={!onPassword || saving || pending}>
          <Field.FieldLabel for="account-password-code">{t('settings_email_code')}</Field.FieldLabel>
          <div class="flex gap-2">
            <Input
              id="account-password-code"
              bind:value={passwordCode}
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength={6}
              placeholder={t('settings_code_placeholder')}
              disabled={!onPassword || saving || pending}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!onSendPasswordCode || saving || sendingCode || pending || cooldown > 0}
              onclick={sendPasswordCode}
            >
              {sendingCode ? t('settings_sending') : cooldown ? t('settings_resend_after', { seconds: cooldown }) : t('settings_send_code')}
            </Button>
          </div>
          <Field.FieldDescription>
            {t('settings_code_destination', { email: user.email })}
          </Field.FieldDescription>
        </Field.Field>
        <Field.FieldGroup class="@min-[480px]/profile:flex-row">
          <Field.Field data-disabled={!onPassword || saving || pending}>
            <Field.FieldLabel for="account-new-password">{t('settings_new_password')}</Field.FieldLabel>
            <Input
              id="account-new-password"
              type="password"
              autocomplete="new-password"
              bind:value={newPassword}
              placeholder={t('settings_new_password_placeholder')}
              disabled={!onPassword || saving || pending}
            />
          </Field.Field>
          <Field.Field data-disabled={!onPassword || saving || pending}>
            <Field.FieldLabel for="account-confirm-password">{t('settings_confirm_password')}</Field.FieldLabel>
            <Input
              id="account-confirm-password"
              type="password"
              autocomplete="new-password"
              bind:value={confirmPassword}
              placeholder={t('settings_confirm_password_placeholder')}
              disabled={!onPassword || saving || pending}
            />
          </Field.Field>
        </Field.FieldGroup>
      </Card.Content>
      <Card.Footer class="flex-wrap justify-between gap-3 border-t pt-5">
        <p class="text-xs text-muted-foreground">{t('settings_password_reset_hint')}</p>
        <Button
          type="submit"
          variant="outline"
          disabled={!onPassword || saving || pending || !newPassword || !confirmPassword}
        >
          {t('settings_password_reset')}
        </Button>
      </Card.Footer>
    </Card.Root>
  </form>

  <Card.Root>
    <Card.Header>
      <Card.Title role="heading" aria-level={3}>{t('settings_sign_in_status')}</Card.Title>
      <Card.Description>{t('settings_sign_out_description')}</Card.Description>
    </Card.Header>
    <Card.Footer class="flex-wrap gap-2">
      <Button variant="outline" disabled={saving || pending} onclick={onRefresh}>
        <RefreshCw data-icon="inline-start" />{t('settings_refresh_account')}
      </Button>
      <Button variant="destructive" disabled={saving || pending} onclick={onSignOut}>
        <LogOut data-icon="inline-start" />{t('settings_sign_out')}
      </Button>
    </Card.Footer>
  </Card.Root>
</div>
