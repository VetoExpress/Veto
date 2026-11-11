<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * conference-header.svelte
   * ─────────────────────────
   * Display 顶部横幅 —— 会场信息 + 阶段指示器。可复用于所有 Display 窗口。
   */
  import { PHASE_LABELS } from '$lib/classes/services/engine/conference-engine'
  import type { DisplayPhase } from '$lib/classes/types/committee-display'

  const DISPLAY_PHASE_LABELS = $derived<Record<DisplayPhase, string>>({
    ...PHASE_LABELS,
    motion: t('components_motion')
  })

  let {
    venue,
    name,
    phase,
    simpleMajority,
    twoThirds
  }: {
    venue: string
    name: string
    phase: DisplayPhase | null
    caucusTopic?: string
    simpleMajority?: number
    twoThirds?: number
  } = $props()
</script>

<div class="relative flex items-center gap-6 border-b border-white/10 px-10 py-2">
  <div class="flex items-center gap-4">
    <div>
      <h1 class="text-xl font-semibold tracking-[0.04em] text-white">{venue}</h1>
      <p class="mt-0.5 text-xs tracking-wider text-white/30 uppercase">{name}</p>
    </div>
  </div>

  <div class="ml-auto flex items-center gap-4">
    {#if phase && phase !== 'preamble' && phase !== 'roll_call'}
      <div class="flex items-center gap-2">
        <div class="rounded-md px-3 py-1 text-center">
          <div class="text-xs tracking-wider text-white/25">{t('components_simple_majority')}</div>
          <div class="text-2xl font-semibold tabular-nums text-white/70">{simpleMajority}</div>
        </div>
        <div class="rounded-md px-3 py-1 text-center">
          <div class="text-xs tracking-wider text-white/25">{t('components_two_thirds_majority')}</div>
          <div class="text-2xl font-semibold tabular-nums text-white/70">{twoThirds}</div>
        </div>
      </div>
    {/if}
    <div
      class="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-5 py-1.5"
    >
      <div class="h-1.5 w-1.5 rounded-full bg-[#5B92E5]"></div>
      <span class="text-sm font-medium tracking-[0.05em] text-white/70 uppercase">
        {phase ? DISPLAY_PHASE_LABELS[phase] : ''}
      </span>
    </div>
  </div>
</div>
