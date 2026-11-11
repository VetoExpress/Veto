<script lang="ts">
  import { t } from '$lib/i18n'
  import { leftBarPinned } from '$lib/classes/stores/battle/battle-ui-store'
  import { quintOut } from 'svelte/easing'
  import { fade, fly } from 'svelte/transition'
  import { currentBattle, currentFaction, addFaction } from '$lib/classes/stores/battle/battle-store'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
  } from '$lib/components/ui/card'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { Plus, Swords, List, Flag, ScrollText, X } from '@lucide/svelte'
  import FactionCard from '$lib/components/map/cards/faction-card.svelte'
  import UnitPanel from '$lib/components/sidebar/unit-panel.svelte'
  import { unitPanelVisible } from '$lib/classes/stores/battle/battle-ui-store'

  function randomColor() {
    const hue = Math.floor(Math.random() * 360)
    return `hsl(${hue} 80% 55%)`
  }

  let newFactionName = $state('')
  let newFactionColor = $state(randomColor())
  const nameInputId = 'new-faction-name'

  // 分离两个可见状态，使 unit-panel 先于 leftbar 关闭
  let leftBarVisible = $state($leftBarPinned)

  $effect(() => {
    if ($leftBarPinned) {
      leftBarVisible = true
    } else {
      unitPanelVisible.set(false)
      const t = setTimeout(() => {
        leftBarVisible = false
      }, 210) // unit-panel out:fade 180ms，稍留余量
      return () => clearTimeout(t)
    }

    console.log($unitPanelVisible)
  })

  function handleAddFaction() {
    const name = newFactionName.trim()
    if (!name) return
    addFaction(name, newFactionColor)
    newFactionName = ''
    newFactionColor = randomColor()
  }

  $effect(() => {
    void $currentBattle?.actionLog.length
    logBottom?.scrollIntoView({ block: 'end' })
  })
  let logBottom: HTMLElement | undefined = $state()

  $effect(() => {
    // 访问 actionLog 以建立响应依赖
    void $currentBattle?.actionLog.length
    logBottom?.scrollIntoView({ block: 'end' })
  })
</script>

{#if leftBarVisible}
  <div
    class="absolute top-24 bottom-24 left-5 z-10 w-[22rem]"
    in:fly={{ x: -8, duration: 220, opacity: 0 }}
    out:fly={{ x: -8, duration: 320, opacity: 0 }}
  >
    <Card class="veto-sidebar h-full gap-0">
      <CardHeader class="border-b px-5 py-4">
        <CardTitle class="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <Swords class="h-4 w-4 text-red-500" />
          {t('components_faction_console')}
          <Button
            variant="ghost"
            size="icon"
            class="ml-auto size-6 shrink-0 text-muted-foreground hover:text-foreground"
            title={t('components_close')}
            onclick={() => leftBarPinned.set(false)}
          >
            <X class="size-3.5" />
          </Button>
        </CardTitle>
        <CardDescription class="text-xs text-muted-foreground"
          >{t('components_select_before_deploy')}</CardDescription
        >
      </CardHeader>

      <CardContent
        class="sidebar-body grid h-full grid-rows-[auto_1fr_auto] overflow-hidden px-5 py-4"
      >
        <!-- 行 1: 新建阵营表单 (auto) -->
        <div class="mt-4 space-y-3">
          <div class="space-y-2">
            <Label
              for={nameInputId}
              class="flex items-center gap-1.5 text-xs tracking-wide text-muted-foreground uppercase"
            >
              <Flag class="h-3.5 w-3.5" />
              {t('components_new_faction')}
            </Label>
            <Input
              id={nameInputId}
              type="text"
              bind:value={newFactionName}
              placeholder={t('components_faction_name_input')}
              onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && handleAddFaction()}
            />
          </div>

          <Button
            type="button"
            class="h-10 w-full"
            onclick={handleAddFaction}
            disabled={!newFactionName.trim()}
          >
            <Plus class="mr-1 h-4 w-4" />
            {t('components_add_faction')}
          </Button>
        </div>

        <!-- 行 2: 现有阵营列表 (1fr，撑满剩余空间) -->
        <div class="flex min-h-0 flex-col">
          {#if $currentBattle}
            <Label
              class="mt-6 mb-2 flex items-center gap-1.5 text-xs tracking-wide text-muted-foreground uppercase"
            >
              <List class="h-3.5 w-3.5" />
              {t('components_existing_factions')}
            </Label>
            <ScrollArea class="faction-scroll min-h-0 flex-1 border-t border-dashed pt-5 pr-2">
              <div class="space-y-2 pb-4">
                {#each $currentBattle.factions as faction (faction.id)}
                  <FactionCard {faction} />
                {/each}

                {#if $currentBattle.factions.length === 0}
                  <div
                    class="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground"
                  >
                    {t('components_no_factions')}
                  </div>
                {/if}
              </div>
            </ScrollArea>
          {:else}
            <div
              class="flex h-full items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground"
            >
              {t('components_load_battle_first')}
            </div>
          {/if}
        </div>

        <!-- 行 3: 行动记录 (auto，固定在底部) -->
        <!-- {#if $currentBattle}
          <div class="border-t border-dashed pt-3">
            <Label
              class="mb-2 flex items-center gap-1.5 text-xs tracking-wide text-muted-foreground uppercase"
            >
              <ScrollText class="h-3.5 w-3.5" />
              行动记录
            </Label>
            <ScrollArea
              class="action-log-scroll h-60 rounded-md border border-dashed bg-muted/30 p-2"
            >
              <div class="space-y-0.5 text-xs">
                {#if $currentBattle.actionLog.length > 0}
                  {#each $currentBattle.actionLog as entry (entry.id)}
                    <p class="flex gap-2 border-b border-border/20 py-1 last:border-0">
                      <span class="shrink-0 text-muted-foreground"
                        >{new Date(entry.timestamp).toLocaleTimeString('zh-CN')}</span
                      >
                      <span>{entry.message}</span>
                    </p>
                  {/each}
                {:else}
                  <p class="py-2 text-center text-muted-foreground">等待操作...</p>
                {/if}
                <div bind:this={logBottom}></div>
              </div>
            </ScrollArea>
          </div>
        {/if} -->
      </CardContent>
    </Card>
  </div>
{/if}

{#if $unitPanelVisible}
  <div
    class="absolute top-24 bottom-24 z-10 w-[24rem] overflow-hidden rounded-xl border"
    style="left: calc(20px + 22rem + 12px)"
    in:fly={{ x: -20, duration: 240, easing: quintOut }}
    out:fade={{ duration: 180 }}
  >
    <UnitPanel />
  </div>
{/if}

<style>
  :global(.faction-scroll [data-slot='scroll-area-scrollbar']) {
    display: none;
  }

  :global(.action-log-scroll [data-slot='scroll-area-scrollbar']) {
    display: none;
  }
</style>
