<script lang="ts">
  import { t } from '$lib/i18n'
  import SeatNameDisplay from '$lib/components/conference-display/seat-name-display.svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'
  /**
   * roll-call/index.svelte
   * ──────────────────────
   * 点名阶段内容组件 —— 通过 $props 接收 Shell 传入的数据。
   *
   * 视图逻辑：
   * - isComplete          → 仅显示汇总（出席/简单多数/2/3多数）
   * - 进行中 + lastMarked → 显示席位名/进度条/统计，叠加 PRESENT/ABSENT badge
   * - 进行中（无标记）     → 仅显示席位名/进度条/统计
   */
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'

  let { data }: { data: ConferenceDisplayData } = $props()
</script>

{#if data.rollCall}
  {@const rc = data.rollCall}
  {@const isComplete = rc.currentIndex >= rc.totalCount}

  <DisplayPage>
    <div class="flex w-full max-w-5xl flex-col items-center gap-10">
      {#if isComplete}
        <!-- ===== 点名完成汇总（独占视图，不混入进行中元素） ===== -->
        <div class="flex flex-col items-center gap-10">
          <div class="flex items-center gap-3 text-white/40">
            <div class="h-px w-12 bg-white/10"></div>
            <span class="text-lg tracking-[0.08em] uppercase">{t('components_roll_call_complete')}</span>
            <div class="h-px w-12 bg-white/10"></div>
          </div>

          <div class="grid grid-cols-3 gap-12">
            <div class="flex flex-col items-center gap-3">
              <div class="text-9xl font-light tabular-nums leading-none text-[#5B92E5]">
                {rc.presentCount}
              </div>
              <div class="text-sm tracking-[0.12em] text-white/30 uppercase">
                {t('components_attendance_total', { count: rc.totalCount })}
              </div>
            </div>
            <div class="flex flex-col items-center gap-3">
              <div class="text-9xl font-light tabular-nums leading-none text-white/40">
                {rc.simpleMajorityThreshold}
              </div>
              <div class="text-sm tracking-[0.12em] text-white/30 uppercase">{t('components_simple_majority')}</div>
            </div>
            <div class="flex flex-col items-center gap-3">
              <div class="text-9xl font-light tabular-nums leading-none text-white/40">
                {rc.twoThirdsThreshold}
              </div>
              <div class="text-sm tracking-[0.12em] text-white/30 uppercase">{t('components_two_thirds_majority')}</div>
            </div>
          </div>

          <div class="text-lg tracking-wider text-white/15">{t('components_wait_chair')}</div>
        </div>
      {:else}
        <!-- ===== 进行中 ===== -->
        <div class="flex flex-col items-center gap-6">
          {#if rc.currentSeat}
            <SeatNameDisplay
              name={rc.currentSeat.name}
              shortName={rc.currentSeat.shortName ?? ''}
            />
          {/if}
        </div>

        <div class="flex items-center gap-3 text-white/40">
          <div class="h-px w-12 bg-white/10"></div>
          <span class="text-lg tracking-[0.08em] uppercase">{t('components_roll_call')}</span>
          <span class="text-base text-white/20 tabular-nums">
            {rc.currentIndex + 1} / {rc.totalCount}
          </span>
          <div class="h-px w-12 bg-white/10"></div>
        </div>

        <!-- 进度条 -->
        <div class="h-[2px] w-[480px] overflow-hidden bg-white/5">
          <div
            class="h-full bg-[#5B92E5] transition-all duration-700"
            style="width: {Math.round((rc.currentIndex / rc.totalCount) * 100)}%"
          ></div>
        </div>

        <!-- 统计 -->
        <div class="flex gap-16 text-base tracking-wider text-white/25">
          <span>{t('components_present_count_label')} <span class="font-semibold text-[#5B92E5]">{rc.presentCount}</span></span>
          <span
            >{t('components_simple_majority')} <span class="font-semibold text-white/40">{rc.simpleMajorityThreshold}</span
            ></span
          >
          <span
            >{t('components_two_thirds_compact')} <span class="font-semibold text-white/40">{rc.twoThirdsThreshold}</span></span
          >
        </div>
      {/if}
    </div>
  </DisplayPage>
{/if}
