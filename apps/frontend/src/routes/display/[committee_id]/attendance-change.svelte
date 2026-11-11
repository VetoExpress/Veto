<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * attendance-change.svelte
   * ──────────────────────────
   * Display 端出席状态变更 —— 全屏展示。
   */
  import type { Attendance } from '$lib/classes/types/conference'

  let { seatName, shortName, status }: {
    seatName: string
    shortName?: string
    status: Attendance
  } = $props()
</script>

<div class="flex h-full w-full items-center justify-center bg-[#0a0e14]">
  <div class="flex flex-col items-center gap-12">
    <!-- 席位名 -->
    <div class="flex flex-col items-center gap-2">
      <h1 class="text-9xl font-semibold tracking-[0.04em] text-white">
        {seatName}
      </h1>
      {#if shortName}
        <p class="text-4xl tracking-[0.08em] text-white/25">
          {shortName}
        </p>
      {/if}
    </div>

    <!-- 状态 badge -->
    <div
      class="flex items-center gap-3 rounded-sm px-8 py-2.5 {status === 'present'
        ? 'border border-[#5B92E5]/30 bg-[#5B92E5]/10'
        : 'border border-white/10 bg-white/[0.02]'}"
    >
      <span
        class="text-2xl font-semibold tracking-[0.08em] {status === 'present'
          ? 'text-[#5B92E5]'
          : 'text-white/30'}"
      >
        {status === 'present' ? t('components_present_badge') : t('components_absent_badge')}
      </span>
    </div>
  </div>
</div>
