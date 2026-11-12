<script lang="ts">
  import { t, formatNumber } from '$lib/i18n'
  /**
   * voting/index.svelte
   * ────────────────────
   * 投票阶段 Display 内容组件 —— 展示唱名表决过程给观众。
   */
  import { Vote } from '@lucide/svelte'
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import SeatRoster, {
    type RosterEntry
  } from '$lib/components/conference-display/seat-roster.svelte'
  import DisplaySectionHeader from '$lib/components/conference-display/display-section-header.svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'

  let { data }: { data: ConferenceDisplayData } = $props()

  const vs = $derived(data.votingSession!)
  const docName = $derived(data.activeMotion?.documentName)

  const rosterEntries = $derived<RosterEntry[]>(
    vs.ballots.map((b) => ({
      id: b.seatId,
      name: b.seatName,
      shortName: b.shortName,
      vote: b.vote
    }))
  )

  const threshold = $derived(vs.rules?.threshold)
  const majorityLabel = $derived(
    threshold?.type === 'fixed'
      ? t('components_threshold_fixed', { count: formatNumber(threshold.value) })
      : t(
          (threshold?.type ?? vs.majorityRule) === 'simple_majority'
            ? 'components_simple_majority'
            : 'components_two_thirds_majority'
        )
  )
  const vetoNames = $derived(
    vs.evaluation?.vetoSeatIds
      .map((id) => vs.ballots.find((ballot) => ballot.seatId === id)?.seatName ?? id)
      .join(', ') ?? ''
  )
  const headerLabel = $derived(docName ? t('components_substantive_vote') : t('components_voting'))
</script>

<DisplayPage>
  <div class="flex flex-col items-center gap-10">
    <!-- 标题栏 -->
    <div class="flex flex-col items-center gap-3">
      <DisplaySectionHeader Icon={Vote} label={headerLabel} colorClass="text-[#5B92E5]" />
      <span class="text-sm tracking-wider text-white/20">
        {majorityLabel}
      </span>
    </div>

    {#if docName}
      <div class="text-4xl font-semibold tracking-wide text-white/60">
        「{docName}」
      </div>
    {/if}

    <!-- 计票数字 -->
    <div class="grid grid-cols-3 gap-8">
      <div
        class="flex w-52 flex-col items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-10 py-10"
      >
        <div class="text-9xl font-light tabular-nums leading-none text-[#5B92E5]">
          {vs.tally.yes}
        </div>
        <div class="text-sm tracking-[0.12em] text-white/30 uppercase">{t('components_yes')}</div>
      </div>
      <div
        class="flex w-52 flex-col items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-10 py-10"
      >
        <div class="text-9xl font-light tabular-nums leading-none text-white/40">
          {vs.tally.no}
        </div>
        <div class="text-sm tracking-[0.12em] text-white/30 uppercase">{t('components_no')}</div>
      </div>
      <div
        class="flex w-52 flex-col items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-10 py-10"
      >
        <div class="text-9xl font-light tabular-nums leading-none text-white/40">
          {vs.tally.abstain}
        </div>
        <div class="text-sm tracking-[0.12em] text-white/30 uppercase">
          {t('components_abstain')}
        </div>
      </div>
    </div>

    {#if vs.evaluation}
      <p class="text-center text-lg text-white/50">
        {#if vs.rules}{t(
            vs.rules.denominator === 'yes_no'
              ? 'components_basis_yes_no'
              : vs.rules.denominator === 'present_participants'
                ? 'components_basis_present_participants'
                : 'components_basis_present_voting_eligible'
          )}{/if}
        {t('components_vote_threshold_summary', {
          denominator: formatNumber(vs.evaluation.denominator),
          required: formatNumber(vs.evaluation.required)
        })}
      </p>
      {#if vs.evaluation.result === 'failed' && vs.evaluation.vetoSeatIds.length > 0}
        <p role="status" class="text-center text-xl text-red-400">
          {t('components_vote_veto_rejection', { seats: vetoNames })}
        </p>
      {/if}
    {:else if vs.result}
      <p class="text-center text-lg text-white/50">
        {t('components_legacy_vote_rules_unavailable')}
      </p>
    {/if}

    <!-- 投票进行中：席位状态网格 -->
    {#if vs.ballots.length > 0}
      <div class="flex flex-col items-center gap-4">
        <div class="text-xs tracking-[0.1em] text-white/20 uppercase">
          {vs.round === 2 ? t('components_second_call') : t('components_roll_call_vote')}
        </div>
        <SeatRoster
          entries={rosterEntries}
          mode="voting"
          currentId={vs.currentSeatId}
          gridCols={5}
        />
      </div>
    {/if}

    <!-- 结果横幅 -->
    {#if vs.result}
      <div
        class="rounded-sm px-10 py-3 text-xl font-semibold tracking-[0.06em] {vs.result === 'passed'
          ? 'bg-[#5B92E5]/10 text-[#5B92E5] border border-[#5B92E5]/20'
          : 'bg-white/5 text-white/40 border border-white/10'}"
      >
        {vs.result === 'passed' ? t('components_vote_adopted') : t('components_vote_failed')}
      </div>
    {/if}
  </div>
</DisplayPage>
