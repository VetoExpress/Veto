<script lang="ts">
  import { t } from '$lib/i18n'
  import { AlertTriangle, HelpCircle, User } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import {
    currentCommittee,
    pointDraft,
    proposePoint
  } from '$lib/classes/stores/conference/conference-store'
  import { POINT_LABELS } from '$lib/classes/types/conference'
  import type { ParticipantSeat, PointType } from '$lib/classes/types/conference'
  import { toSeatView } from '$lib/classes/types/delegate'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import SeatSelector from '$lib/components/conference/common/seat-selector.svelte'

  let { open = $bindable(false) }: { open: boolean } = $props()

  const conf = $derived($currentCommittee)
  const conferenceId = $derived(page.params.conference_id ?? conf?.id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  const pointTypes: PointType[] = [
    'point_of_order',
    'point_of_inquiry',
    'point_of_personal_privilege'
  ]

  const POINT_ICONS: Record<PointType, typeof AlertTriangle> = {
    point_of_order: AlertTriangle,
    point_of_inquiry: HelpCircle,
    point_of_personal_privilege: User
  }

  const POINT_DESCRIPTIONS: Record<PointType, string> = $derived({
    point_of_order: t('procedure_raised_to_correct_a_meeting_process_that_does_not_follow_the_rules_of_procedure'),
    point_of_inquiry: t('procedure_raised_to_ask_about_procedure_or_other_meeting_matters'),
    point_of_personal_privilege: t('procedure_raised_when_a_delegate_is_uncomfortable_or_needs_to_leave_temporarily')
  })

  // ---- Form state ----
  let selectedType = $state<PointType | null>(null)
  let selectedProposer = $state<ParticipantSeat | null>(null)

  const isTimerActive = $derived(conf?.activeSpeaker != null)
  const canPropose = $derived(selectedType !== null && selectedProposer != null)

  function resetForm(): void {
    selectedProposer = null
    selectedType = null
  }

  function handleOpenChange(value: boolean): void {
    if (!value) {
      resetForm()
      pointDraft.set(null)
    }
    open = value
  }

  function handlePropose(): void {
    if (!selectedType || !conf) return

    const proposerDel = selectedProposer || conf.participantSeats[0]
    if (!proposerDel) return

    proposePoint({
      type: selectedType,
      proposedBySeatId: proposerDel.id
    })

    // 跳转到问题页面（navigate 在 cleanup 之前，与 motion-dialog 一致）
    if (conferenceId && committeeId) {
      goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair/question`))
    }

    open = false
    resetForm()
    pointDraft.set(null)
  }

  function isPointTypeDisabled(type: PointType): boolean {
    if (!isTimerActive) return false
    return type !== 'point_of_order'
  }

  function getDisabledReason(type: PointType): string {
    if (type === 'point_of_order') return ''
    return t('procedure_a_speech_is_in_progress_only_a_point_of_order_may_interrupt_use_a_note_for_other_point_2')
  }

  // 实时同步问题草稿到 Display
  $effect(() => {
    if (!open) {
      pointDraft.set(null)
      return
    }
    const proposerDel = selectedProposer
    pointDraft.set({
      proposedBy: proposerDel ? toSeatView(proposerDel) : undefined,
      type: selectedType ?? undefined
    })
  })
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-lg">
      <Dialog.Header class="pb-1">
        <Dialog.Title class="flex items-center gap-2 text-base font-semibold">
          <HelpCircle size={18} class="text-amber-500" />
          {t('procedure_raise_a_point')}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          {t('procedure_choose_a_proposer_then_a_point_type')}
        </Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col gap-4 py-2">
        <!-- 第一步：问题提出方（始终可见） -->
        {#if conf}
          <div>
            <Label class="mb-2 block text-xs text-muted-foreground">{t('procedure_point_proposer')}</Label>
            <SeatSelector
              seats={conf.participantSeats}
              bind:value={selectedProposer}
              presentOnly={true}
            />
          </div>
        {/if}

        <!-- 第二步：问题类型选择（选完提出方后出现） -->
        {#if selectedProposer}
          <Separator />
          <div>
            <Label class="mb-2 block text-xs text-muted-foreground">{t('procedure_point_type')}</Label>
            <div class="flex flex-col gap-2">
              {#each pointTypes as pt (pt)}
                {@const Icon = POINT_ICONS[pt] ?? HelpCircle}
                {@const disabled = isPointTypeDisabled(pt)}
                <button
                  type="button"
                  {disabled}
                  class="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all {selectedType ===
                  pt
                    ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                    : disabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-muted'}"
                  onclick={() => (selectedType = pt)}
                  title={getDisabledReason(pt)}
                >
                  <Icon size={16} />
                  <div class="flex flex-col">
                    <span class="text-xs font-medium">{POINT_LABELS[pt]}</span>
                    <span class="text-[10px] text-muted-foreground">
                      {POINT_DESCRIPTIONS[pt]}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
            {#if isTimerActive}
              <p class="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
                {t('procedure_a_speech_is_in_progress_only_a_point_of_order_may_interrupt_use_a_note_for_other_point')}
              </p>
            {/if}
          </div>
        {/if}
      </div>

      <Dialog.Footer class="pt-1">
        <Button variant="outline" onclick={() => (open = false)}>{t('procedure_cancel')}</Button>
        <Button onclick={handlePropose} disabled={!canPropose} class="min-w-[120px] gap-2">
          {t('procedure_submit_point')}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
