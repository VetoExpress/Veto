<script lang="ts">
  import { Search, Plus, Swords } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import * as InputGroup from '$lib/components/ui/input-group/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import { battles } from '$lib/classes/stores/battle/battle-store'
  import BattleCard from '$lib/components/home/battle-card.svelte'
  import CreateBattleDialog from '$lib/components/home/create-battle/create-battle-dialog.svelte'
  import { cn } from '$lib/classes/utils.js'
  import { fly } from 'svelte/transition'

  interface Props {
    conferenceId: string
    mode: string | null
    class?: string
  }

  let { mode, conferenceId, class: className }: Props = $props()

  let query = $state('')
  let dialogOpen = $state(false)

  const filteredBattles = $derived(
    query.trim()
      ? $battles.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
      : $battles
  )
</script>

<div
  class={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}
  in:fly={{ y: 8, duration: 320, opacity: 0 }}
>
  {#if mode === null}
    <!-- Empty state -->
    <div
      class="flex flex-1 items-center justify-center"
      in:fly={{ y: 8, duration: 320, opacity: 0 }}
    >
      <div class="flex flex-col items-center gap-3 text-muted-foreground">
        <Swords size={48} class="opacity-30" />
        <p class="text-lg font-medium">请从左侧选择一个模式</p>
        <p class="text-sm opacity-70">选择推演模式以查看和管理战局</p>
      </div>
    </div>
  {:else}
    <!-- Header -->
    <div class="grid grid-cols-3 items-center gap-6 border-b px-8 py-5">
      <!-- 左侧：标题 -->
      <div>
        <h2 class="text-xl font-semibold text-foreground">战局管理</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">
          {$battles.length} 个战局
        </p>
      </div>

      <!-- 中间：搜索 -->
      <InputGroup.Root>
        <InputGroup.Input bind:value={query} placeholder="搜索战局..." />
        <InputGroup.Addon>
          <Search class="h-4 w-4" />
        </InputGroup.Addon>
      </InputGroup.Root>

      <!-- 右侧：操作 -->
      <div class="flex justify-end">
        <Button onclick={() => (dialogOpen = true)} class="gap-2">
          <Plus size={16} />
          新建战局
        </Button>
      </div>
    </div>

    <!-- Battle List -->
    <ScrollArea class="flex-1">
      <div class="px-8 py-6">
        {#if filteredBattles.length === 0}
          <Card.Root class="border-dashed bg-card/30 py-16 text-center shadow-none">
            <Card.Content class="p-0">
              {#if query.trim() && $battles.length > 0}
                <p class="text-muted-foreground">未找到匹配的战局</p>
                <p class="mt-1 text-sm text-muted-foreground/70">试试其他关键词？</p>
              {:else}
                <p class="text-muted-foreground">暂无已保存的战局</p>
                <p class="mt-1 text-sm text-muted-foreground/70">创建一个新战局开始推演</p>
              {/if}
            </Card.Content>
          </Card.Root>
        {:else}
          <div class="flex flex-col gap-3">
            {#each filteredBattles as battle (battle.id)}
              <BattleCard {battle} />
            {/each}
          </div>
        {/if}
      </div>
    </ScrollArea>
  {/if}
</div>

<!-- Create Battle Dialog -->
<CreateBattleDialog bind:open={dialogOpen} {conferenceId} />
