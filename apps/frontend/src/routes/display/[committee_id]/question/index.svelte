<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * question/index.svelte
   * ──────────────────────
   * 问题展示组件 —— 编辑阶段实时同步 + 提交后展示。
   */
  import { POINT_LABELS } from '$lib/classes/types/conference'
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import SeatNameDisplay from '$lib/components/conference-display/seat-name-display.svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'

  let { data }: { data: ConferenceDisplayData } = $props()

  const draft = $derived(data.pointDraft ?? null)
  const activePoint = $derived(data.activePoint ?? null)

  // 优先显示 draft（编辑中），其次显示 activePoint（提交后）
  const type = $derived(draft?.type ?? activePoint?.type)
  const proposer = $derived(draft?.proposedBy ?? activePoint?.proposedBy)

  const label = $derived(type ? (POINT_LABELS[type] ?? type) : '')
  const hasType = $derived(type != null)
</script>

<DisplayPage>
  {#if proposer}
    <div class="text-center">
      <SeatNameDisplay name={proposer.name} shortName={proposer.shortName ?? ''} />
      {#if hasType}
        <div class="mt-4 text-4xl tracking-wide text-white/40">
          {t('components_point_raised', { point: label })}
        </div>
      {:else}
        <div class="mt-4 text-5xl tracking-wide text-white/30">{t('components_raise_point')}</div>
      {/if}
    </div>
  {/if}
</DisplayPage>
