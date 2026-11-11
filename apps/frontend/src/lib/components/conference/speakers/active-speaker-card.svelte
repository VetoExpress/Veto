<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * active-speaker-card.svelte
   * ──────────────────────────
   * 可复用的「正在发言」卡片 —— 显示当前发言人名称、倒计时、发言控制按钮。
   */
  import SpeakerControls from '$lib/components/conference/speakers/speaker-controls.svelte'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import type { YieldType } from '$lib/classes/types/conference'

  interface Props {
    seatName: string
    remainingSec: number
    totalSec: number
    isPaused?: boolean
    canYield?: boolean
    yieldNote?: string
    onpause?: () => void
    onresume?: () => void
    onend?: () => void
    onyield?: (type: YieldType) => void
  }

  let {
    seatName,
    remainingSec,
    totalSec,
    isPaused = false,
    canYield = true,
    yieldNote,
    onpause,
    onresume,
    onend,
    onyield
  }: Props = $props()

  const elapsedSec = $derived(Math.floor(totalSec - remainingSec))
  const isUrgent = $derived(remainingSec <= 10 && !isPaused)
</script>

<div
  class="rounded-lg border-2 p-6 text-center transition-colors {isUrgent
    ? 'animate-pulse border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/30'
    : 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'}"
>
  <div
    class="text-sm font-medium {isUrgent
      ? 'text-red-600 dark:text-red-400'
      : 'text-emerald-700 dark:text-emerald-400'}"
  >
    {isPaused ? t('procedure_timer_paused') : isUrgent ? t('procedure_time_is_running_out') : t('procedure_speaking')}
  </div>
  <div class="mt-1 text-2xl font-bold text-foreground">
    {seatName}
  </div>
  <div
    class="mt-3 font-mono text-5xl font-bold tabular-nums {isPaused
      ? 'text-muted-foreground'
      : isUrgent
        ? 'text-red-500'
        : 'text-foreground'}"
  >
    {formatTime(remainingSec)}
  </div>
  <div class="mt-1 text-xs text-muted-foreground">
    {t('procedure_speech_elapsed_total', { value1: elapsedSec, value2: totalSec })}
  </div>

  <div class="mt-4">
    <SpeakerControls {isPaused} {canYield} {onpause} {onresume} {onend} {onyield} />
  </div>
  {#if yieldNote}
    <div class="mt-2 text-xs text-amber-600 dark:text-amber-400">{yieldNote}</div>
  {/if}
</div>
