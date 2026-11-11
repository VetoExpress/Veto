<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * speaker-queue-display.svelte
   * ─────────────────────────────
   * 可复用的 Display 发言名单组件。展示下一个发言席位 + 后续队列，支持限制显示数量。
   */
  import { Mic } from '@lucide/svelte'
  import type { SeatView } from '$lib/classes/types/conference'
  import DisplaySectionHeader from './display-section-header.svelte'
  import SeatNameDisplay from './seat-name-display.svelte'
  import SeatRoster, { type RosterEntry } from './seat-roster.svelte'

  interface Speaker {
    seat: SeatView
  }

  let {
    speakers,
    max = Infinity,
    emptyText,
    title,
    subtitle = '',
    onlyList = false
  }: {
    speakers: Speaker[]
    max?: number
    emptyText?: string
    title?: string
    /** 显示在下一个发言名称下方的状态文字，如"等待主席开始计时" */
    subtitle?: string
    /**
     * 仅显示发言名单（无标题栏、无"下一个发言"高亮大字体）。
     * 此时 title / subtitle / emptyText 不需要填写。
     */
    onlyList?: boolean
  } = $props()

  const nextSpeaker = $derived(onlyList ? null : (speakers[0] ?? null))

  /** 队列条目（list 模式传给 SeatRoster） */
  const rosterEntries = $derived<RosterEntry[]>(
    (onlyList ? speakers : speakers.slice(1)).map((s) => ({
      id: s.seat.name,
      name: s.seat.name,
      shortName: s.seat.shortName
    }))
  )

  /** 调整 max：非 onlyList 时 nextSpeaker 占 1 个槽位 */
  const rosterMax = $derived(onlyList ? max : max - 1)
</script>

<div class="flex w-full flex-col items-center gap-5">
  {#if !onlyList}
    <DisplaySectionHeader Icon={Mic} label={title ?? t('components_speakers_list')} colorClass="text-[#5B92E5]" />
  {/if}

  {#if nextSpeaker}
    <!-- 下一个发言 -->
    <div class="w-full px-8 py-6 text-center">
      <SeatNameDisplay
        name={nextSpeaker.seat.name}
        shortName={nextSpeaker.seat.shortName}
      />
      {#if subtitle}
        <div class="mt-4 text-lg tracking-wider text-white/15">{subtitle}</div>
      {/if}
    </div>
  {/if}

  {#if rosterEntries.length > 0}
    <SeatRoster entries={rosterEntries} mode="list" emptyText="" />
  {/if}

  {#if speakers.length === 0}
    <div class="text-lg tracking-wider text-white/10">{emptyText ?? t('components_wait_add_speakers')}</div>
  {/if}
</div>
