<script lang="ts">
  import { untrack } from 'svelte'
  import { t, formatNumber, type MessageKey } from '$lib/i18n'
  import { Button } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import { Input } from '$lib/components/ui/input'
  import * as Field from '$lib/components/ui/field'
  import * as Select from '$lib/components/ui/select'
  import { isParticipantSeat, type Seat } from '$lib/classes/types/delegate'
  import type { ProcedureRulesConfig, ThresholdRule } from '$lib/classes/types/procedure-rules'
  import {
    calculateQuorum,
    thresholdCount,
    validateProcedureRules
  } from '$lib/classes/utils/committee/procedure-rules'

  interface Props {
    initialRules: ProcedureRulesConfig
    seats: Seat[]
    onSave: (config: ProcedureRulesConfig) => boolean
    vetoMode?: 'rules' | 'seat'
  }
  type Option = { value: string; label: MessageKey }

  let { initialRules, seats, onSave, vetoMode = 'rules' }: Props = $props()
  // The parent keys this form by committee; store updates must not replace an open draft.
  let draft = $state<ProcedureRulesConfig>(
    untrack(() => structuredClone($state.snapshot(initialRules)))
  )
  let savedValue = $state(untrack(() => JSON.stringify(initialRules)))
  let saved = $state(false)
  let failedValue = $state<string | null>(null)

  const quorumBases: Option[] = [
    { value: 'all_participants', label: 'settings_rules_all_participants' },
    { value: 'voting_eligible', label: 'settings_rules_voting_eligible' }
  ]
  const proceduralBases: Option[] = [
    { value: 'present_participants', label: 'settings_rules_present_participants' },
    { value: 'present_voting_eligible', label: 'settings_rules_present_voting_eligible' }
  ]
  const documentBases: Option[] = [
    { value: 'present_voting_eligible', label: 'settings_rules_present_voting_eligible' },
    { value: 'yes_no', label: 'settings_rules_yes_no' }
  ]
  const ratios: Option[] = [
    { value: 'simple_majority', label: 'settings_majority_simple' },
    { value: 'two_thirds', label: 'settings_majority_two_thirds' }
  ]
  const thresholds: Option[] = [...ratios, { value: 'fixed', label: 'settings_rules_fixed' }]
  const proceduralThresholds: Option[] = [
    { value: 'default', label: 'settings_rules_motion_defaults' },
    ...thresholds
  ]

  let participants = $derived(seats.filter(isParticipantSeat))
  let eligibleSeats = $derived(participants.filter((seat) => seat.procedure.hasVotingRights))
  let valid = $derived(validateProcedureRules(draft, participants))
  let draftValue = $derived(JSON.stringify(draft))
  let dirty = $derived(draftValue !== savedValue)
  let quorum = $derived(
    validThreshold(draft.quorum.threshold) ? calculateQuorum(participants, draft.quorum) : null
  )
  let invalidVetoSeats = $derived(
    draft.veto.seatIds.some((id) => !eligibleSeats.some((seat) => seat.id === id))
  )
  let proceduralDenominator = $derived(
    participants.filter(
      (seat) =>
        seat.procedure.attendance === 'present' &&
        (draft.proceduralVote.denominator === 'present_participants' ||
          seat.procedure.hasVotingRights)
    ).length
  )
  let proceduralRequired = $derived(
    draft.proceduralVote.threshold != null && validThreshold(draft.proceduralVote.threshold)
      ? thresholdCount(proceduralDenominator, draft.proceduralVote.threshold!)
      : null
  )

  function validThreshold(threshold: ThresholdRule | null): boolean {
    return (
      threshold?.type !== 'fixed' || (Number.isSafeInteger(threshold.value) && threshold.value > 0)
    )
  }

  function changeThreshold(value: string): ThresholdRule | null {
    if (value === 'default') return null
    if (value === 'fixed') return { type: 'fixed', value: 1 }
    return { type: value as 'simple_majority' | 'two_thirds' }
  }

  function save(event: SubmitEvent): void {
    event.preventDefault()
    const config = $state.snapshot(draft)
    if (!validateProcedureRules(config, participants)) {
      console.warn(t('settings_rules_invalid'), {
        type: 'InvalidProcedureRules',
        operation: 'setProcedureRules',
        impact: 'draft_retained'
      })
      return
    }
    if (!onSave(config)) {
      failedValue = draftValue
      console.warn(t('settings_rules_save_failed'), {
        type: 'ProcedureRulesSaveRejected',
        operation: 'setProcedureRules',
        impact: 'draft_retained'
      })
      return
    }
    savedValue = draftValue
    saved = true
    failedValue = null
  }
</script>

{#snippet choice(
  id: string,
  label: MessageKey,
  value: string,
  options: Option[],
  onChange: (value: string) => void
)}
  <Field.Field>
    <Field.Label for={id}>{t(label)}</Field.Label>
    <Select.Root type="single" {value} onValueChange={onChange}>
      <Select.Trigger {id} class="w-full">
        {t(options.find((option) => option.value === value)?.label ?? 'settings_choose')}
      </Select.Trigger>
      <Select.Content>
        <Select.Group>
          {#each options as option (option.value)}
            <Select.Item value={option.value} label={t(option.label)} />
          {/each}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  </Field.Field>
{/snippet}

{#snippet fixedThreshold(
  id: string,
  threshold: ThresholdRule | null,
  onChange: (threshold: ThresholdRule) => void
)}
  {#if threshold?.type === 'fixed'}
    <Field.Field data-invalid={!validThreshold(threshold)}>
      <Field.Label for={id}>{t('settings_rules_fixed_value')}</Field.Label>
      <Input
        {id}
        type="number"
        min={1}
        step={1}
        required
        value={threshold.value}
        aria-invalid={!validThreshold(threshold)}
        aria-describedby={`${id}-hint`}
        oninput={(event) => onChange({ type: 'fixed', value: event.currentTarget.valueAsNumber })}
      />
      <Field.Description id={`${id}-hint`}>
        {t('settings_rules_positive_integer')}
      </Field.Description>
    </Field.Field>
  {/if}
{/snippet}

<form onsubmit={save} class="blur-setting-card rounded-lg px-6 py-4">
  <Field.Group>
    <Field.Set>
      <Field.Legend class="text-lg font-semibold">{t('settings_procedure_rules')}</Field.Legend>
      <Field.Description>{t('settings_procedure_rules_description')}</Field.Description>
      <Field.Description>{t('settings_rules_snapshot_notice')}</Field.Description>
      <Field.Group>
        <Field.Set>
          <Field.Legend variant="label" class="text-lg font-semibold">
            {t('settings_rules_quorum')}
          </Field.Legend>
          <Field.Group class="gap-4">
            {@render choice(
              'rules-quorum-basis',
              'settings_rules_denominator',
              draft.quorum.denominator,
              quorumBases,
              (value) =>
                (draft.quorum.denominator = value as ProcedureRulesConfig['quorum']['denominator'])
            )}
            {@render choice(
              'rules-quorum-threshold',
              'settings_rules_threshold',
              draft.quorum.threshold.type,
              thresholds,
              (value) => (draft.quorum.threshold = changeThreshold(value)!)
            )}
            {@render fixedThreshold(
              'rules-quorum-fixed',
              draft.quorum.threshold,
              (value) => (draft.quorum.threshold = value)
            )}
            <Field.Description aria-live="polite">
              {#if quorum}
                {t('settings_rules_quorum_preview', {
                  denominator: formatNumber(quorum.denominator),
                  present: formatNumber(quorum.present),
                  required: formatNumber(quorum.required)
                })}
                {quorum.met ? t('settings_rules_quorum_met') : t('settings_rules_quorum_unmet')}
              {:else}
                {t('settings_rules_positive_integer')}
              {/if}
            </Field.Description>
          </Field.Group>
        </Field.Set>
        <Field.Set>
          <Field.Legend variant="label" class="text-lg font-semibold">
            {t('settings_rules_procedural')}
          </Field.Legend>
          <Field.Description>{t('settings_rules_procedural_hint')}</Field.Description>
          <Field.Group class="gap-4">
            {@render choice(
              'rules-procedural-basis',
              'settings_rules_denominator',
              draft.proceduralVote.denominator,
              proceduralBases,
              (value) =>
                (draft.proceduralVote.denominator =
                  value as ProcedureRulesConfig['proceduralVote']['denominator'])
            )}
            {@render choice(
              'rules-procedural-threshold',
              'settings_rules_threshold',
              draft.proceduralVote.threshold?.type ?? 'default',
              proceduralThresholds,
              (value) => (draft.proceduralVote.threshold = changeThreshold(value))
            )}
            {@render fixedThreshold(
              'rules-procedural-fixed',
              draft.proceduralVote.threshold,
              (value) => (draft.proceduralVote.threshold = value)
            )}
            <Field.Description>
              {#if proceduralRequired != null}
                {t('settings_rules_procedural_preview', {
                  denominator: formatNumber(proceduralDenominator),
                  required: formatNumber(proceduralRequired)
                })}
              {:else}
                {t('settings_rules_procedural_default_preview', {
                  denominator: formatNumber(proceduralDenominator)
                })}
              {/if}
            </Field.Description>
          </Field.Group>
        </Field.Set>
        <Field.Set>
          <Field.Legend variant="label" class="text-lg font-semibold">
            {t('settings_rules_document')}
          </Field.Legend>
          <Field.Group class="gap-4">
            {@render choice(
              'rules-document-basis',
              'settings_rules_denominator',
              draft.documentVote.denominator,
              documentBases,
              (value) =>
                (draft.documentVote.denominator =
                  value as ProcedureRulesConfig['documentVote']['denominator'])
            )}
            {@render choice(
              'rules-document-ratio',
              'settings_rules_threshold',
              draft.documentVote.ratio,
              ratios,
              (value) =>
                (draft.documentVote.ratio = value as ProcedureRulesConfig['documentVote']['ratio'])
            )}
            <Field.Description>
              {t('settings_rules_document_preview', {
                present: formatNumber(
                  participants.filter(
                    (seat) =>
                      seat.procedure.attendance === 'present' && seat.procedure.hasVotingRights
                  ).length
                )
              })}
            </Field.Description>
          </Field.Group>
        </Field.Set>
        {#if vetoMode === 'rules'}
          <Field.Set>
            <Field.Legend variant="label" class="text-lg font-semibold">
              {t('settings_rules_veto')}
            </Field.Legend>
            <Field.Group class="gap-4">
            <Field.Field orientation="horizontal">
              <Checkbox id="rules-veto-enabled" bind:checked={draft.veto.enabled} />
              <Field.Label for="rules-veto-enabled">{t('settings_rules_veto_enabled')}</Field.Label>
            </Field.Field>
            <Field.Field
              data-invalid={invalidVetoSeats || (draft.veto.enabled && !draft.veto.seatIds.length)}
            >
              <Field.Label for="rules-veto-seats">{t('settings_rules_veto_seats')}</Field.Label>
              <Select.Root type="multiple" bind:value={draft.veto.seatIds}>
                <Select.Trigger
                  id="rules-veto-seats"
                  class="w-full"
                  aria-invalid={invalidVetoSeats ||
                    (draft.veto.enabled && !draft.veto.seatIds.length)}
                  aria-describedby="rules-veto-hint"
                >
                  {draft.veto.seatIds.length
                    ? t('settings_rules_selected_seats', {
                        count: formatNumber(draft.veto.seatIds.length)
                      })
                    : t('settings_rules_select_seats')}
                </Select.Trigger>
                <Select.Content>
                  <Select.Group>
                    {#each eligibleSeats as seat (seat.id)}
                      <Select.Item value={seat.id} label={seat.name} />
                    {/each}
                  </Select.Group>
                </Select.Content>
              </Select.Root>
              <Field.Description id="rules-veto-hint">
                {t('settings_rules_veto_hint')}
              </Field.Description>
              {#if eligibleSeats.length === 0}
                <Field.Description>{t('settings_rules_no_eligible_seats')}</Field.Description>
              {/if}
              {#if draft.veto.enabled && !draft.veto.seatIds.length}
                <Field.Error>{t('settings_rules_veto_required')}</Field.Error>
              {/if}
              {#if invalidVetoSeats}
                <Field.Error>{t('settings_rules_veto_invalid')}</Field.Error>
                <Button
                  type="button"
                  variant="outline"
                  onclick={() => {
                    draft.veto.seatIds = draft.veto.seatIds.filter((id) =>
                      eligibleSeats.some((seat) => seat.id === id)
                    )
                  }}
                >
                  {t('settings_rules_remove_ineligible')}
                </Button>
              {/if}
            </Field.Field>
            </Field.Group>
          </Field.Set>
        {:else}
          <Field.Set>
            <Field.Legend variant="label" class="text-lg font-semibold">
              {t('settings_rules_veto')}
            </Field.Legend>
            <Field.Description>{t('settings_rules_veto_seat_assignment_hint')}</Field.Description>
            <Field.Description>
              {#if eligibleSeats.some((seat) => seat.procedure.hasVetoPower)}
                {t('settings_rules_veto_assigned_seats', {
                  seats: eligibleSeats
                    .filter((seat) => seat.procedure.hasVetoPower)
                    .map((seat) => seat.name)
                    .join('、')
                })}
              {:else}
                {t('settings_rules_veto_no_assigned_seats')}
              {/if}
            </Field.Description>
          </Field.Set>
        {/if}
      </Field.Group>
    </Field.Set>
    {#if !valid}
      <Field.Error>{t('settings_rules_invalid')}</Field.Error>
    {/if}
    {#if failedValue === draftValue}
      <Field.Error>{t('settings_rules_save_failed')}</Field.Error>
    {/if}
    <Field.Field orientation="horizontal">
      <Button type="submit" disabled={!valid || !dirty}>{t('settings_save_changes')}</Button>
      <Field.Description role="status">
        {dirty ? t('settings_rules_unsaved') : saved ? t('settings_rules_saved') : ''}
      </Field.Description>
    </Field.Field>
  </Field.Group>
</form>
