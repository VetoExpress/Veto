<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus'
  import SwordsIcon from '@lucide/svelte/icons/swords'
  import PuzzleIcon from '@lucide/svelte/icons/puzzle'
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import { createBattle } from '$lib/classes/stores/battle/battle-store'
  import { CalendarDate, type DateValue } from '@internationalized/date'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import type { InstalledPlugin } from '$lib/classes/services/plugin/plugin-db'
  import { dbGetAllPlugins } from '$lib/classes/services/plugin/plugin-db'
  import CampaignModeDialog from './campaign-mode-dialog.svelte'
  import FreeModeForm from './free-mode-form.svelte'
  import { isElectron } from '$lib/classes/utils/runtime'

  let { open = $bindable(false), conferenceId }: { open: boolean; conferenceId: string } = $props()

  /** 已安装的插件列表（异步从主进程文件系统加载） */
  let installedPlugins = $state<InstalledPlugin[]>([])
  let electronEnvironment = $state(false)
  onMount(async () => {
    electronEnvironment = isElectron()
    if (electronEnvironment) {
      installedPlugins = await dbGetAllPlugins()
    }
  })

  const campaignPlugins = $derived(installedPlugins.filter((p) => p.manifest.type === 'campaign'))
  const factionPlugins = $derived(installedPlugins.filter((p) => p.manifest.type === 'faction'))
  const hasAnyMods = $derived(factionPlugins.length > 0)

  let step = $state<'mode_select' | 'free'>('free')

  /** 战役模式独立对话框 */
  let campaignDialogOpen = $state(false)

  let draft = $state({
    name: '',
    startDate: new CalendarDate(2026, 1, 1) as DateValue | undefined,
    timeScale: 60,
    pixelsPerKm: 10,
    iconStyle: 'nato' as 'nato' | 'simple',
    selectedFaction: null as string | null,
  })

  function resetDraft() {
    draft = {
      name: '',
      startDate: new CalendarDate(2026, 1, 1),
      timeScale: 60,
      pixelsPerKm: 10,
      iconStyle: 'nato',
      selectedFaction: null,
    }
  }

  function handleCreate() {
    const name = draft.name.trim()
    if (!name) return
    const enabledMods = [
      draft.selectedFaction
    ].filter((id): id is string => id !== null)
    if (enabledMods.length === 0) {
      enabledMods.push('base')
    }
    createBattle(name, {
      conferenceId,
      startDate: draft.startDate?.toString(),
      timeScale: draft.timeScale,
      pixelsPerKm: draft.pixelsPerKm,
      iconStyle: draft.iconStyle,
      enabledMods
    })
    open = false
    goto(`/client/${conferenceId}/battle`)
  }

  function handleOpenChange(value: boolean) {
    if (value) {
      resetDraft()
      step = electronEnvironment ? 'mode_select' : 'free'
    }
    open = value
  }

  function enterCampaignMode(): void {
    open = false
    campaignDialogOpen = true
  }

  function enterFreeMode(): void {
    step = 'free'
  }

  function backToModeSelect(): void {
    step = 'mode_select'
  }

  function handleCampaignCreate(name: string, campaignId: string) {
    createBattle(name, {
      conferenceId,
      enabledMods: [campaignId],
      campaignId
    })
    campaignDialogOpen = false
    goto(`/client/${conferenceId}/battle`)
  }
</script>

<!-- 中转站：模式选择 + 自由模式 -->
<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-xl">
      <Dialog.Header class="pb-1">
        <Dialog.Title class="text-base font-semibold tracking-wide">
          {#if step === 'mode_select' && electronEnvironment}
            新建战局
          {:else}
            新建自由推演
          {/if}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          {#if step === 'mode_select' && electronEnvironment}
            选择推演模式开始。战役模式将自动加载预设的阵营、地图与事件。
          {:else}
            自由配置所有参数，从头构建一场推演。
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col gap-0 py-2">
        {#if step === 'mode_select' && electronEnvironment}
          <div class="grid grid-cols-2 gap-4 px-1 py-4">
            <!-- 战役模式卡片 -->
            <button
              type="button"
              class="text-left focus:outline-none"
              onclick={enterCampaignMode}
              disabled={campaignPlugins.length === 0}
            >
              <Card.Root
                class="cursor-pointer border-2 border-stone-200 bg-stone-50
                  transition-all hover:border-amber-400 hover:bg-amber-50 hover:shadow-md
                  dark:border-stone-700 dark:bg-stone-800/60 dark:hover:border-amber-600
                  dark:hover:bg-amber-900/20
                  {campaignPlugins.length === 0 ? 'cursor-not-allowed opacity-50' : ''}"
              >
                <Card.Content class="flex flex-col items-center gap-3 p-6 text-center">
                  <div
                    class="flex h-14 w-14 items-center justify-center rounded-xl
                      bg-amber-100 text-amber-600 transition-transform group-hover:scale-110
                      dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    <SwordsIcon size={28} />
                  </div>
                  <div>
                    <Card.Title class="text-sm font-semibold text-stone-800 dark:text-stone-200">
                      战役模式
                    </Card.Title>
                    <Card.Description class="mt-1 text-[11px] leading-relaxed">
                      选择预设战役包，阵营、地图、事件自动加载，命名后即刻推演。
                    </Card.Description>
                  </div>
                  <Badge
                    variant={campaignPlugins.length === 0 ? 'secondary' : 'outline'}
                    class="text-[10px] {campaignPlugins.length > 0
                      ? 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : ''}"
                  >
                    {campaignPlugins.length === 0
                      ? '暂无可用战役'
                      : `${campaignPlugins.length} 个可用`}
                  </Badge>
                </Card.Content>
              </Card.Root>
            </button>

            <!-- 自由模式卡片 -->
            <button type="button" class="text-left focus:outline-none" onclick={enterFreeMode}>
              <Card.Root
                class="cursor-pointer border-2 border-stone-200 bg-stone-50
                  transition-all hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-md
                  dark:border-stone-700 dark:bg-stone-800/60 dark:hover:border-emerald-600
                  dark:hover:bg-emerald-900/20"
              >
                <Card.Content class="flex flex-col items-center gap-3 p-6 text-center">
                  <div
                    class="flex h-14 w-14 items-center justify-center rounded-xl
                      bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-110
                      dark:bg-emerald-900/30 dark:text-emerald-400"
                  >
                    <PuzzleIcon size={28} />
                  </div>
                  <div>
                    <Card.Title class="text-sm font-semibold text-stone-800 dark:text-stone-200">
                      自由模式
                    </Card.Title>
                    <Card.Description class="mt-1 text-[11px] leading-relaxed">
                      自行组合阵营、Mod 与时间参数，完全自定义推演环境。
                    </Card.Description>
                  </div>
                  <Badge
                    variant="outline"
                    class="border-emerald-300 bg-emerald-100 text-[10px] text-emerald-700
                      dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  >
                    完全自定义
                  </Badge>
                </Card.Content>
              </Card.Root>
            </button>
          </div>
        {:else}
          <!-- 自由模式表单 -->
          {#if electronEnvironment}
            <button
              type="button"
              class="mb-1 flex items-center gap-1 px-1 text-xs text-muted-foreground
                transition-colors hover:text-stone-800 dark:hover:text-stone-200"
              onclick={backToModeSelect}
            >
              <ArrowLeftIcon size={12} />
              返回模式选择
            </button>
          {/if}
          <FreeModeForm
            bind:draft
            {factionPlugins}
            {hasAnyMods}
            onenter={handleCreate}
          />
        {/if}
      </div>

      <Dialog.Footer class="pt-1">
        {#if step === 'mode_select' && electronEnvironment}
          <Button variant="outline" onclick={() => (open = false)}>取消</Button>
        {:else}
          {#if electronEnvironment}
            <Button variant="outline" onclick={backToModeSelect}>
              <ArrowLeftIcon size={13} class="mr-1" />
              返回
            </Button>
          {:else}
            <Button variant="outline" onclick={() => (open = false)}>取消</Button>
          {/if}
          <Button onclick={handleCreate} disabled={!draft.name.trim()} class="min-w-[120px] gap-2">
            <PlusIcon size={15} />
            初始化战局
          </Button>
        {/if}
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<!-- 战役模式独立大对话框 -->
{#if electronEnvironment}
  <CampaignModeDialog
    bind:open={campaignDialogOpen}
    {campaignPlugins}
    onclose={() => {
      campaignDialogOpen = false
      open = true
    }}
    oncreate={handleCampaignCreate}
  />
{/if}
