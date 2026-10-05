<script lang="ts">
  import { ExternalLink } from '@lucide/svelte'
  import { accountStore } from '$lib/classes/stores/app/account-store'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import AccountProfile from './account-profile.svelte'
  import * as Card from '$lib/components/ui/card'
  import * as Field from '$lib/components/ui/field'
  import * as Alert from '$lib/components/ui/alert'

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

<div class="flex max-w-xl flex-col gap-6">
  <div>
    <h2 class="text-2xl font-semibold">账号</h2>
    <p class="mt-2 text-sm text-muted-foreground">管理你的 Veto 账号与登录状态。</p>
  </div>

  {#if $accountStore.error}
    <Alert.Root variant="destructive">
      <Alert.Title>账号操作失败</Alert.Title>
      <Alert.Description>{$accountStore.error}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if $accountStore.warning}
    <Alert.Root>
      <Alert.Title>登录状态提示</Alert.Title>
      <Alert.Description>{$accountStore.warning}</Alert.Description>
    </Alert.Root>
  {/if}

  {#if !$accountStore.ready}
    <p role="status" class="flex items-center gap-2"><Spinner />正在恢复登录状态…</p>
  {:else if !$accountStore.available}
    <Card.Root>
      <Card.Header>
        <Card.Title role="heading" aria-level={3}>前往云平台</Card.Title>
        <Card.Description>网页版账号管理请使用云平台。</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button onclick={openPlatform}>打开云平台<ExternalLink data-icon="inline-end" /></Button>
      </Card.Footer>
    </Card.Root>
  {:else if $accountStore.user}
    <AccountProfile
      user={$accountStore.user}
      pending={$accountStore.pending}
      onRefresh={() => accountStore.run('refresh')}
      onSignOut={() => accountStore.run('signOut')}
      onSave={(name, avatar) => accountStore.updateProfile({ name, ...(avatar ? { avatar } : {}) })}
      onPassword={(password) => accountStore.updateProfile({ password })}
    />
  {:else}
    <Card.Root>
      <Card.Header>
        <Card.Title role="heading" aria-level={3}>登录 Veto</Card.Title>
        <Card.Description>使用与云平台相同的邮箱和密码登录。</Card.Description>
      </Card.Header>
      <Card.Content>
        <form id="account-login" onsubmit={login}>
          <Field.FieldGroup>
            <Field.Field>
              <Field.FieldLabel for="account-email">邮箱</Field.FieldLabel>
              <Input
                id="account-email"
                type="email"
                autocomplete="username"
                bind:value={email}
                required
                disabled={$accountStore.pending}
              />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="account-password">密码</Field.FieldLabel>
              <Input
                id="account-password"
                type="password"
                autocomplete="current-password"
                bind:value={password}
                required
                disabled={$accountStore.pending}
              />
            </Field.Field>
          </Field.FieldGroup>
        </form>
      </Card.Content>
      <Card.Footer class="flex-wrap gap-2">
        <Button type="submit" form="account-login" disabled={$accountStore.pending}>
          {#if $accountStore.pending}<Spinner data-icon="inline-start" />{/if}
          {$accountStore.pending ? '正在登录…' : '登录'}
        </Button>
        <Button variant="link" onclick={openPlatform}>
          注册 / 找回密码<ExternalLink data-icon="inline-end" />
        </Button>
      </Card.Footer>
    </Card.Root>
  {/if}
</div>
