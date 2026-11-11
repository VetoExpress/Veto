<script lang="ts">
  import { t } from '$lib/i18n'
  import PlusIcon from '@lucide/svelte/icons/plus'
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
  import SearchIcon from '@lucide/svelte/icons/search'
  import XIcon from '@lucide/svelte/icons/x'
  import FlagIcon from '@lucide/svelte/icons/flag'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import * as Empty from '$lib/components/ui/empty/index.js'
  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte'
  import PackageIcon from '@lucide/svelte/icons/package'
  import type { InstalledPlugin } from '$lib/classes/services/plugin/plugin-db'
  import CampaignListItem from './campaign-list-item.svelte'
  import CampaignDetail from './campaign-detail.svelte'

  interface Props {
    open: boolean
    campaignPlugins: InstalledPlugin[]
    onclose: () => void
    oncreate: (name: string, campaignId: string) => void
  }

  let { open = $bindable(false), campaignPlugins, onclose, oncreate }: Props = $props()

  let name = $state('')
  let selectedCampaign = $state<string | null>(null)
  let searchQuery = $state('')

  const filteredCampaigns = $derived(
    searchQuery.trim()
      ? campaignPlugins.filter(
          (p) =>
            p.manifest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.manifest.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : campaignPlugins
  )

  // 首次打开时自动选中第一个战役
  $effect(() => {
    if (open && campaignPlugins.length > 0 && !selectedCampaign) {
      selectedCampaign = campaignPlugins[0].id
    }
  })

  const selectedCampaignMeta = $derived(
    campaignPlugins.find((p) => p.id === selectedCampaign) ?? null
  )

  function selectCampaign(id: string): void {
    selectedCampaign = id
  }

  function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || !selectedCampaign) return
    oncreate(trimmed, selectedCampaign)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleCreate()
  }

  function handleOpenChange(value: boolean) {
    if (!value) onclose()
    open = value
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content
      class="w-[1024px] max-w-[calc(100vw-40px)] sm:max-w-[1024px] h-[85vh] p-0 gap-0"
      showCloseButton={false}
    >
      <!-- 关闭按钮 -->
      <Button
        class="absolute end-4 top-4 z-10 opacity-70 transition-opacity hover:opacity-100"
        variant="ghost"
        size="icon"
        aria-label={t('settings_close')}
        onclick={onclose}
      >
        <XIcon size={18} />
      </Button>

      <div class="flex h-full w-full overflow-hidden rounded-lg">
        <!-- 左侧栏：搜索 + 战役列表 -->
        <div class="flex w-[280px] shrink-0 flex-col bg-muted/50">
          <div class="px-5 pt-5 pb-3">
            <h1 class="text-[22px] font-bold leading-none tracking-tight">{t('settings_new_campaign')}</h1>
            <p class="mt-1.5 text-sm text-muted-foreground">{t('settings_campaign_name_hint')}</p>
          </div>

          <!-- 搜索框 -->
          <div class="px-3 pb-2">
            <div class="relative">
              <SearchIcon
                size={14}
                class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input bind:value={searchQuery} placeholder={t('settings_search_campaigns')} class="h-8 pl-8 text-xs" />
            </div>
          </div>

          <Separator />

          <!-- 战役列表 -->
          <div class="flex flex-1 flex-col overflow-hidden px-3 pt-3">
            <div class="mb-1.5 flex items-center gap-1.5 px-1">
              <FlagIcon size={11} class="text-muted-foreground" />
              <span class="text-[11px] font-medium text-muted-foreground">
                {t('settings_available_campaigns')}
                {#if searchQuery.trim()}
                  <span class="text-muted-foreground/60"> · {t('settings_match_count', { count: filteredCampaigns.length })}</span>
                {/if}
              </span>
            </div>

            {#if campaignPlugins.length === 0}
              <div class="flex flex-1 items-center justify-center">
                <Empty.Root>
                  <Empty.Media>
                    <PackageIcon size={28} class="text-muted-foreground" />
                  </Empty.Media>
                  <Empty.Title class="text-sm">{t('settings_no_campaigns')}</Empty.Title>
                  <Empty.Description class="text-xs">{t('settings_install_campaign_hint')}</Empty.Description>
                </Empty.Root>
              </div>
            {:else if filteredCampaigns.length === 0}
              <div class="flex flex-col items-center justify-center gap-1 py-8 text-center">
                <SearchIcon size={24} class="text-muted-foreground/40" />
                <p class="text-xs text-muted-foreground">{t('settings_no_campaign_matches')}</p>
              </div>
            {:else}
              <ScrollArea class="flex-1 -mr-2 pr-2">
                <div class="flex flex-col gap-0.5">
                  {#each filteredCampaigns as p (p.id)}
                    <CampaignListItem
                      plugin={p}
                      selected={selectedCampaign === p.id}
                      onclick={() => selectCampaign(p.id)}
                    />
                  {/each}
                </div>
              </ScrollArea>
            {/if}
          </div>

          <!-- 左侧底部 -->
          <div class="flex flex-col gap-1 px-5 pb-5 pt-2">
            <Button variant="outline" class="w-full" onclick={onclose}>
              <ArrowLeftIcon size={14} class="mr-1" />
              {t('settings_back_modes')}
            </Button>
          </div>
        </div>

        <!-- 右侧：命名 + 战役详情 -->
        <div class="flex flex-1 flex-col bg-background">
          {#if selectedCampaignMeta}
            <!-- 可滚动内容 -->
            <ScrollArea class="flex-1 w-full">
              <div class="flex flex-col gap-6 p-10 pb-4">
                <!-- 命名框 -->
                <div>
                  <Label for="campaign-name" class="mb-2 block text-sm font-medium">
                    {t('settings_name_simulation')}
                  </Label>
                  <Input
                    id="campaign-name"
                    bind:value={name}
                    placeholder={t('settings_campaign_name_placeholder', { name: selectedCampaignMeta.manifest.name })}
                    class="h-10 text-sm"
                    onkeydown={handleKeydown}
                  />
                </div>

                <Separator />

                <!-- 战役信息 -->
                <CampaignDetail manifest={selectedCampaignMeta.manifest} />
              </div>
            </ScrollArea>

            <!-- 创建按钮（固定在底部） -->
            <div class="shrink-0 border-t border-stone-200 px-10 py-4 dark:border-stone-700">
              <div class="flex justify-end">
                <Button
                  onclick={handleCreate}
                  disabled={!name.trim()}
                  class="min-w-[140px] gap-2"
                  size="lg"
                >
                  <PlusIcon size={16} />
                  {t('settings_start_simulation')}
                </Button>
              </div>
            </div>
          {:else}
            <div class="flex flex-1 items-center justify-center">
              <Empty.Root class="border-0">
                <Empty.Media>
                  <FlagIcon size={36} class="text-muted-foreground/30" />
                </Empty.Media>
                <Empty.Title class="text-base">{t('settings_choose_campaign')}</Empty.Title>
                <Empty.Description class="text-sm">
                  {t('settings_choose_campaign_hint')}
                </Empty.Description>
              </Empty.Root>
            </div>
          {/if}
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
