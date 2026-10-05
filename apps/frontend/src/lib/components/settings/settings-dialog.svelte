<script lang="ts">
  import { onMount } from 'svelte'
  import { Settings, Info, X, Puzzle, Map, User, ChevronRight } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Separator from '$lib/components/ui/separator/index.js'
  import GeneralPage from './pages/common/general.svelte'
  import ModsPage from './pages/common/mods.svelte'
  import AboutPage from '../settings/pages/common/about.svelte'
  import CommitteePage from './pages/common/committee.svelte'
  import AccountPage from './pages/common/account.svelte'
  import * as Avatar from '$lib/components/ui/avatar'
  import { accountStore } from '$lib/classes/stores/app/account-store'

  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import {
    settingsDialogOpen,
    activeSettingsSection
  } from '$lib/classes/stores/app/global-ui-store'
  import { isElectron } from '$lib/classes/utils/runtime'
  const version = `${__APP_VERSION__}-${__APP_BUILD_TIME__}`

  let activeSection = $state<Section>('general')
  let electronEnvironment = $state(false)
  type Section = 'general' | 'mods' | 'committee' | 'about' | 'account'

  interface NavItem {
    key: Section
    label: string
    icon: typeof Settings
  }

  let NAV_TOP: NavItem[] = $state([
    { key: 'general', label: '常规设置', icon: Settings },
    { key: 'mods', label: '模组设置', icon: Puzzle },
    { key: 'committee', label: '会议设置', icon: Map }
  ])

  let NAV_BOTTOM: NavItem[] = $state([{ key: 'about', label: '关于', icon: Info }])

  let open = $state(false)

  onMount(() => {
    electronEnvironment = isElectron()
    if (!electronEnvironment && activeSection === 'mods') {
      activeSection = 'general'
    }
    return accountStore.connect(window.veto?.account)
  })

  settingsDialogOpen.subscribe((v) => {
    const wasClosed = !open && v
    open = v
    if (wasClosed) {
      // 打开时读取指定的 section，否则默认 general
      const target = $activeSettingsSection
      if (target === 'mods' && !electronEnvironment) {
        activeSection = 'general'
        activeSettingsSection.set(null)
      } else if (target) {
        activeSection = target
        activeSettingsSection.set(null)
      } else {
        activeSection = 'general'
      }
    }
  })

  function onOpenChange(o: boolean): void {
    settingsDialogOpen.set(o)
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content
      class="w-[calc(100vw-40px)] max-w-[1024px] sm:max-w-[1024px] h-[85vh] p-0 gap-0"
      showCloseButton={false}
    >
      <!-- 关闭按钮 -->
      <Dialog.Title class="sr-only">设置</Dialog.Title>
      <Dialog.Description class="sr-only">管理账号、应用偏好与会议设置。</Dialog.Description>
      <Button
        class="absolute end-4 top-4 z-10 opacity-70 transition-opacity hover:opacity-100"
        variant="ghost"
        size="icon"
        onclick={() => settingsDialogOpen.set(false)}
      >
        <X size={18} />
      </Button>
      <div class="flex h-full w-full overflow-hidden rounded-lg">
        <!-- 左侧导航 -->
        <div class="flex w-[240px] shrink-0 flex-col bg-muted/50">
          <div class="px-5 pt-5 pb-2">
            <h1 class="text-[26px] font-bold leading-none tracking-tight">设置</h1>
            <p class="mt-1.5 text-sm text-muted-foreground">个性化与全局设置</p>
          </div>

          <!-- 用户卡片 -->
          <div class="px-3 pt-1 pb-1">
            <Button
              class="h-auto w-full justify-start gap-3 px-3 py-2.5 text-start"
              variant={activeSection === 'account' ? 'secondary' : 'ghost'}
              aria-label="账号设置"
              aria-current={activeSection === 'account' ? 'page' : undefined}
              onclick={() => (activeSection = 'account')}
            >
              <Avatar.Root class="size-9">
                {#if $accountStore.user?.avatar}
                  <Avatar.Image src={$accountStore.user.avatar} alt={$accountStore.user.name} />
                {/if}
                <Avatar.Fallback>
                  <User />
                </Avatar.Fallback>
              </Avatar.Root>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">
                  {$accountStore.user?.name ?? ($accountStore.ready ? '未登录' : '正在恢复账号…')}
                </div>
                <div class="truncate text-xs text-muted-foreground">
                  {$accountStore.user?.email ?? '登录与账号管理'}
                </div>
              </div>
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>

          <div class="px-3 pb-1">
            <Separator.Root />
          </div>

          <div class="flex flex-1 flex-col gap-0.5 px-3 pt-3">
            {#each NAV_TOP as item (item.key)}
              {#if item.key !== 'mods' || electronEnvironment}
                <Button
                  class="w-full cursor-pointer justify-start gap-2.5 px-3 h-9"
                  variant={activeSection === item.key ? 'secondary' : 'ghost'}
                  onclick={() => (activeSection = item.key)}
                >
                  <item.icon size={18} />
                  <span class="text-sm">{item.label}</span>
                </Button>
              {/if}
            {/each}
          </div>
          <div class="mt-auto flex flex-col gap-0.5 px-3 pt-2 pb-5">
            {#each NAV_BOTTOM as item (item.key)}
              <Button
                class="w-full cursor-pointer justify-start gap-2.5 px-3 h-9"
                variant={activeSection === item.key ? 'secondary' : 'ghost'}
                onclick={() => (activeSection = item.key)}
              >
                <item.icon size={18} />
                <span class="text-sm">{item.label}</span>
              </Button>
            {/each}
          </div>

          <div class="flex flex-col gap-1 px-5 pb-5">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold">Veto</span>
            </div>
            <span class="text-xs text-muted-foreground">Version {version}</span>
          </div>
        </div>

        <!-- 右侧内容 -->
        <div class="flex min-w-0 flex-1 flex-col bg-background">
          <ScrollArea class="h-full w-full">
            <div class="p-10">
              {#if activeSection === 'general'}<GeneralPage />{/if}
              {#if activeSection === 'account'}<AccountPage />{/if}
              {#if activeSection === 'mods' && electronEnvironment}<ModsPage />{/if}
              {#if activeSection === 'committee'}<CommitteePage />{/if}
              {#if activeSection === 'about'}<AboutPage />{/if}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
