<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * seat-roster.svelte
   * ──────────────────────────
   * 可复用的席位名单组件，统一使用网格布局，支持两种显示模式：
   *
   * - voting : 彩色圆点（赞成/反对/弃权/跳过/未投）+ 名称 + 当前高亮
   * - list   : 序号 + 名称，超出上限显示 "还有 N 位代表"
   */
  import { cn } from '$lib/classes/utils.js'

  export interface RosterEntry {
    /** 唯一标识（用于 key 和 currentId 匹配） */
    id: string
    /** 席位名称 */
    name: string
    /** 席位简称（可选） */
    shortName?: string
    /** 投票状态（voting 模式使用） */
    vote?: string | null
  }

  let {
    entries,
    mode = 'list',
    currentId = null,
    max = Infinity,
    gridCols = 5,
    emptyText
  }: {
    entries: RosterEntry[]
    /** 显示模式：voting = 表决状态, list = 顺序名单 */
    mode?: 'voting' | 'list'
    /** voting 模式下高亮的席位 ID */
    currentId?: string | null
    /** list 模式最大显示数量，超出显示溢出提示 */
    max?: number
    /** 网格列数 */
    gridCols?: number
    /** 空状态文本 */
    emptyText?: string
  } = $props()

  const visibleEntries = $derived(
    mode === 'list' ? entries.slice(0, max) : entries
  )
  const hasMore = $derived(mode === 'list' && entries.length > max)
  const remaining = $derived(mode === 'list' ? entries.length - max : 0)

  function dotClass(vote: string | null | undefined): string {
    switch (vote) {
      case 'yes':
        return 'bg-emerald-400'
      case 'no':
        return 'bg-red-400'
      case 'abstain':
        return 'bg-amber-400'
      case 'skip':
        return 'bg-slate-500'
      default:
        return 'border border-white/20 bg-transparent'
    }
  }

  function nameClass(vote: string | null | undefined): string {
    if (vote === null || vote === undefined) return 'text-white/30'
    if (vote === 'skip') return 'text-slate-400'
    return 'text-white/70'
  }
</script>

{#if entries.length === 0}
  <div class="text-lg tracking-wider text-white/10">{emptyText ?? t('components_no_seats')}</div>
{:else}
  <div
    class="grid gap-x-6 gap-y-2"
    style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr));"
  >
    {#each visibleEntries as entry, i (entry.id)}
      {@const isCurrent = entry.id === currentId}
      <div
        class={cn(
          'flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors',
          isCurrent && 'bg-[#5B92E5]/10 ring-1 ring-[#5B92E5]/30'
        )}
      >
        {#if mode === 'voting'}
          <!-- 投票状态圆点 -->
          <div class={cn('h-2 w-2 shrink-0 rounded-full', dotClass(entry.vote))}></div>
        {:else}
          <!-- 序号 -->
          <span class="w-2 shrink-0 text-center text-xs tabular-nums text-white/25">{i + 1}</span>
        {/if}
        <span class={mode === 'voting' ? nameClass(entry.vote) : 'text-white/50'}>
          {entry.name}
        </span>
      </div>
    {/each}

    {#if hasMore}
      <div class="col-span-full flex items-center justify-center gap-4 py-1.5">
        <span class="text-sm text-white/15">...</span>
        <span class="text-lg text-white/20">{t('components_remaining_seats', { count: remaining })}</span>
      </div>
    {/if}
  </div>
{/if}
