<script lang="ts">
  import {
    procedureMessage,
    renderProcedureMessage,
    type ProcedureMessage
  } from '$lib/components/conference/common/message'
  import { t, formatNumber } from '$lib/i18n'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { Plus, RotateCcw, Users } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { Card, CardContent } from '$lib/components/ui/card'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import {
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription
  } from '$lib/components/ui/empty'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
  } from '$lib/components/ui/alert-dialog'
  import {
    currentCommittee,
    currentConferenceRecord,
    setSeatVotingRights,
    resetRollCall
  } from '$lib/classes/stores/conference/conference-store'
  import { addSeat, updateSeat } from '$lib/classes/stores/delegate/delegate-store'
  import {
    calculateQuorum,
    defaultProcedureRules
  } from '$lib/classes/utils/committee/procedure-rules'
  import { VETO_NAME } from '$lib/classes/const'
  import { isParticipantSeat } from '$lib/classes/types/delegate'
  import { resolve } from '$app/paths'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'
  import ParticipantSeatTable from '$lib/components/conference/committee/participant-seat-table.svelte'
  import { ScrollArea } from '$lib/components/ui/scroll-area'

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  const conf = $derived($currentCommittee)
  const conference = $derived($currentConferenceRecord)
  const sortedSeats = $derived(
    conf
      ? conf.seats
          .filter(isParticipantSeat)
          .sort((a, b) => a.procedure.sortOrder - b.procedure.sortOrder)
      : []
  )
  const quorum = $derived(
    conf
      ? calculateQuorum(
          sortedSeats,
          (conf.procedureRules ?? defaultProcedureRules(conf.substantiveVotingMajority)).quorum
        )
      : null
  )
  const stats = $derived(
    quorum
      ? [
          { value: quorum.present, label: t('components_quorum_present') },
          { value: quorum.denominator, label: t('components_quorum_denominator') },
          { value: quorum.required, label: t('components_quorum_required') },
          {
            value: sortedSeats.filter(
              (seat) => seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights
            ).length,
            label: t('procedure_eligible_to_vote')
          }
        ]
      : []
  )

  const participantSeatGroupId = $derived.by(() => {
    const participantSeat = conf?.seats.find(isParticipantSeat)
    if (participantSeat) return participantSeat.seatGroupId
    return conference?.seatGroups.find((group) => group.type === 'cabinet')?.id ?? ''
  })

  // ---- 重新点名确认 ----
  let showResetConfirm = $state(false)
  let showAddSeatDialog = $state(false)
  let newSeatName = $state('')
  let newSeatShortName = $state('')
  let newSeatVotingRights = $state(true)
  let addSeatError = $state<ProcedureMessage>('')

  function openAddSeatDialog(): void {
    newSeatName = ''
    newSeatShortName = ''
    newSeatVotingRights = true
    addSeatError = ''
    showAddSeatDialog = true
  }

  function submitNewSeat(event: SubmitEvent): void {
    event.preventDefault()
    const name = newSeatName.trim()
    if (!name) {
      addSeatError = procedureMessage('procedure_enter_a_seat_name')
      return
    }
    if (!conf || !participantSeatGroupId) {
      addSeatError = procedureMessage(
        'procedure_no_participant_seat_group_is_available_in_this_conference'
      )
      return
    }

    const seatId = addSeat(name, participantSeatGroupId)
    if (!seatId) {
      addSeatError = procedureMessage('procedure_failed_to_add_seat_try_again_later')
      return
    }

    updateSeat(seatId, { shortName: newSeatShortName.trim() || undefined })
    setSeatVotingRights(seatId, newSeatVotingRights)
    showAddSeatDialog = false
  }
</script>

<svelte:head>
  <title>{t('procedure_participants_page_title', { value1: VETO_NAME })}</title>
</svelte:head>

<PageTopBar
  icon={Users}
  title={t('procedure_participants')}
  subtitle={conf?.name}
  backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
>
  {#snippet actions()}
    <Button
      variant="outline"
      size="sm"
      class="h-8 gap-1.5 text-xs"
      disabled={!conf}
      onclick={openAddSeatDialog}
    >
      <Plus size={12} />
      {t('procedure_add_seat')}
    </Button>
    <AlertDialog bind:open={showResetConfirm}>
      <AlertDialogTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            size="sm"
            variant="outline"
            class="h-8 gap-1.5 text-xs"
            disabled={!conf || sortedSeats.length === 0}
          >
            <RotateCcw size={12} />
            {t('procedure_restart_roll_call')}
          </Button>
        {/snippet}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('procedure_restart_roll_call')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'procedure_this_resets_all_participants_to_absent_and_returns_the_meeting_to_roll_call_continue'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('procedure_cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onclick={() => {
              resetRollCall()
              showResetConfirm = false
              goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair/roll-call`))
            }}
          >
            {t('procedure_confirm_restart')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  {/snippet}
</PageTopBar>

<Dialog.Root bind:open={showAddSeatDialog}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('procedure_add_seat')}</Dialog.Title>
      <Dialog.Description>
        {t('procedure_add_committee_participant', {
          value1: conf?.name ?? t('procedure_current_committee')
        })}
      </Dialog.Description>
    </Dialog.Header>
    <form class="flex flex-col gap-4" onsubmit={submitNewSeat}>
      <Field.FieldGroup>
        <Field.Field>
          <Field.FieldLabel for="new-seat-name">{t('procedure_seat_name')}</Field.FieldLabel>
          <Input
            id="new-seat-name"
            bind:value={newSeatName}
            placeholder={t('procedure_for_example_france')}
            aria-invalid={!!addSeatError || undefined}
          />
        </Field.Field>
        <Field.Field>
          <Field.FieldLabel for="new-seat-short-name">
            {t('procedure_seat_abbreviation_optional')}
          </Field.FieldLabel>
          <Input
            id="new-seat-short-name"
            bind:value={newSeatShortName}
            placeholder={t('procedure_for_example_fra')}
          />
        </Field.Field>
        <Field.Field>
          <div class="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <div class="space-y-0.5">
              <Field.FieldLabel for="new-seat-voting-rights">
                {t('procedure_voting_rights')}
              </Field.FieldLabel>
              <p class="text-xs text-muted-foreground">
                {t('procedure_turn_off_to_add_this_seat_as_an_observer')}
              </p>
            </div>
            <Switch id="new-seat-voting-rights" bind:checked={newSeatVotingRights} />
          </div>
        </Field.Field>
      </Field.FieldGroup>
      {#if addSeatError}<Field.FieldError>
          {renderProcedureMessage(addSeatError)}
        </Field.FieldError>{/if}
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (showAddSeatDialog = false)}>
          {t('procedure_cancel')}
        </Button>
        <Button type="submit">{t('procedure_add_seat')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<ScrollArea class="min-h-0 flex-1">
  <div class="mx-auto max-w-4xl px-6 py-6">
    {#if conf && quorum}
      <p role="status" class={['mb-3 text-sm', { 'text-destructive': !quorum.met }]}>
        {t(quorum.met ? 'components_quorum_met' : 'components_quorum_unmet')}
      </p>
      <!-- 统计卡片 -->
      <div class="mb-8 grid grid-cols-4 gap-4">
        {#each stats as stat (stat.label)}
          <Card>
            <CardContent class="flex flex-col items-center gap-1 p-5">
              <span class="text-2xl font-bold text-foreground">{formatNumber(stat.value)}</span>
              <span class="text-sm text-muted-foreground">{stat.label}</span>
            </CardContent>
          </Card>
        {/each}
      </div>

      <!-- 参会席位列表 -->
      <ParticipantSeatTable seats={sortedSeats} />
    {:else}
      <div class="py-12">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users size={24} />
            </EmptyMedia>
            <EmptyTitle>{t('procedure_conference_not_found')}</EmptyTitle>
            <EmptyDescription>{t('procedure_create_a_conference_first')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    {/if}
  </div>
</ScrollArea>
