<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import { ExternalLink, UserRound, ArrowRight, Cloud } from '@lucide/svelte'
  import { accountStore } from '$lib/classes/stores/app/account-store'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import AccountProfile from './account-profile.svelte'
  import * as Card from '$lib/components/ui/card'
  import * as Field from '$lib/components/ui/field'
  import * as Alert from '$lib/components/ui/alert'
  import { Switch } from '$lib/components/ui/switch'
  import { conferenceSync } from '$lib/classes/stores/conference/conference-sync-store'

  let email = $state('')
  let password = $state('')
  async function login(event: SubmitEvent) {
    event.preventDefault()
    try {
      await accountStore.run('login', email, password)
    } finally {
      password = ''
    }
  }
  function openPlatform() {
    window.location.replace('https://platform.miaoyww.top/login?from=app')
  }
</script>

<div class="@container/account flex w-full min-w-0 flex-col gap-6">
  <div>
    <h2 class="text-2xl font-semibold">{t('settings_account')}</h2>
    <p class="mt-2 text-sm text-muted-foreground">{t('settings_account_description')}</p>
  </div>

  {#if $accountStore.available}
    <Card.Root>
      <Card.Header>
        <div class="flex items-center justify-between gap-4">
          <Card.Title>{t('settings_cloud_sync')}</Card.Title>
          <Switch aria-label={t('settings_cloud_sync')} checked={$conferenceSync.enabled} onCheckedChange={(enabled) => conferenceSync.setEnabled(enabled)} />
        </div>
        <Card.Description>{t('settings_cloud_sync_description')}</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3 text-sm">
        <p role="status" class="text-muted-foreground">
          {!$conferenceSync.enabled ? t('settings_cloud_sync_disabled') : !$accountStore.user ? t('settings_cloud_sync_signed_out') : $conferenceSync.syncing ? t('settings_syncing') : $conferenceSync.syncedAt ? t('settings_last_synced', { date: formatDate($conferenceSync.syncedAt, { dateStyle: 'short', timeStyle: 'short' }) }) : t('settings_sync_waiting')}
        </p>
        {#if $conferenceSync.error}<p role="alert" class="text-destructive">{$conferenceSync.error}</p>{/if}
        {#each $conferenceSync.conflicts as conflict (conflict.id)}
          <div class="space-y-2 rounded-lg border p-3">
            <p>{t('settings_sync_conflict', { name: conflict.name })}</p>
            <div class="flex gap-2">
              <Button size="sm" variant="outline" onclick={() => conferenceSync.resolve(conflict.id, 'local')}>{t('settings_keep_local')}</Button>
              <Button size="sm" variant="outline" onclick={() => conferenceSync.resolve(conflict.id, 'cloud')}>{t('settings_use_cloud')}</Button>
            </div>
          </div>
        {/each}
      </Card.Content>
      <Card.Footer>
        <Button variant="outline" disabled={!$accountStore.user || !$conferenceSync.enabled || $conferenceSync.syncing} onclick={() => void conferenceSync.sync()}>{t('settings_sync_now')}</Button>
      </Card.Footer>
    </Card.Root>
  {/if}

  {#if $accountStore.error}
    <Alert.Root variant="destructive">
      <Alert.Title>{t('settings_account_failed')}</Alert.Title>
      <Alert.Description>{$accountStore.error}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if $accountStore.warning}
    <Alert.Root>
      <Alert.Title>{t('settings_sign_in_notice')}</Alert.Title>
      <Alert.Description>{$accountStore.warning}</Alert.Description>
    </Alert.Root>
  {/if}

  {#if !$accountStore.ready}
    <p role="status" class="flex items-center gap-2"><Spinner />{t('settings_restoring_sign_in')}</p>
  {:else if !$accountStore.available}
    <Card.Root class="mx-auto w-full max-w-md">
      <Card.Header>
        <div
          class="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <Cloud class="size-6" />
        </div>
        <Card.Title role="heading" aria-level={3}>{t('settings_go_platform')}</Card.Title>
        <Card.Description>{t('settings_web_account_description')}</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button onclick={openPlatform}>{t('settings_open_platform')}<ExternalLink data-icon="inline-end" /></Button>
      </Card.Footer>
    </Card.Root>
  {:else if $accountStore.user}
    <AccountProfile
      user={$accountStore.user}
      pending={$accountStore.pending}
      onRefresh={() => accountStore.run('refresh')}
      onSignOut={() => accountStore.run('signOut')}
      onSave={(name, avatar) => accountStore.updateProfile({ name, ...(avatar ? { avatar } : {}) })}
      onSendPasswordCode={() => accountStore.sendPasswordCode()}
      onPassword={(code, password) => accountStore.resetPassword(code, password)}
    />
  {:else}
    <Card.Root class="mx-auto w-full max-w-md">
      <Card.Header>
        <div
          class="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <UserRound class="size-6" />
        </div>
        <Card.Title role="heading" aria-level={3}>{t('settings_sign_in_veto')}</Card.Title>
        <Card.Description>{t('settings_sign_in_description')}</Card.Description>
      </Card.Header>
      <Card.Content>
        <form id="account-login" onsubmit={login}>
          <Field.FieldGroup>
            <Field.Field data-disabled={$accountStore.pending}>
              <Field.FieldLabel for="account-email">{t('settings_email')}</Field.FieldLabel>
              <Input
                id="account-email"
                type="email"
                placeholder={t('settings_email_placeholder')}
                autocomplete="username"
                bind:value={email}
                required
                disabled={$accountStore.pending}
              />
            </Field.Field>
            <Field.Field data-disabled={$accountStore.pending}>
              <Field.FieldLabel for="account-password">{t('settings_password')}</Field.FieldLabel>
              <Input
                id="account-password"
                type="password"
                placeholder={t('settings_password_placeholder')}
                autocomplete="current-password"
                bind:value={password}
                required
                disabled={$accountStore.pending}
              />
            </Field.Field>
          </Field.FieldGroup>
        </form>
      </Card.Content>
      <Card.Footer class="flex-col gap-3">
        <Button class="w-full" type="submit" form="account-login" disabled={$accountStore.pending}>
          {#if $accountStore.pending}<Spinner data-icon="inline-start" />{/if}
          {$accountStore.pending ? t('settings_signing_in') : t('settings_sign_in')}
          {#if !$accountStore.pending}<ArrowRight data-icon="inline-end" />{/if}
        </Button>
        <Button variant="link" onclick={openPlatform}>
          {t('settings_register_recover')}<ExternalLink data-icon="inline-end" />
        </Button>
      </Card.Footer>
    </Card.Root>
  {/if}
</div>
