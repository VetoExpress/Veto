<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * current-speaker-card.svelte
   * ────────────────────────────
   * Display 端当前发言人卡片：状态标题栏 + 席位全称/简称 + 发言倒计时。
   */
  import { Mic } from '@lucide/svelte'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import type { SeatView } from '$lib/classes/types/conference'
  import DisplaySectionHeader from './display-section-header.svelte'
  import SeatNameDisplay from './seat-name-display.svelte'

  let {
    seat,
    remainingSec,
    status
  }: {
    seat: SeatView
    remainingSec: number
    status: 'playing' | 'paused'
  } = $props()

  const isPaused = $derived(status === 'paused')
  const accentColor = $derived(isPaused ? 'text-[#C9A84C]' : 'text-[#5B92E5]')
</script>

<div class="flex flex-col items-center">
  <DisplaySectionHeader
    Icon={Mic}
    label={isPaused ? t('components_timer_paused') : t('components_speaking')}
    colorClass={accentColor}
  />

  <SeatNameDisplay name={seat.name} shortName={seat.shortName} />

  <!-- 倒计时 -->
  <div
    class="font-mono text-[120px] font-light tabular-nums leading-none tracking-tight {accentColor}"
  >
    {formatTime(Math.max(0, remainingSec ?? 0))}
  </div>
</div>
