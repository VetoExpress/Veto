<script lang="ts">
  import { t } from '$lib/i18n'
  import { Plus, Trash2 } from '@lucide/svelte'
  import type { SeatGroupType } from '$lib/classes/types/delegate'
  import { Button } from '$lib/components/ui/button'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'
  import * as Tabs from '$lib/components/ui/tabs'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import ProcedureRulesSettings from '$lib/components/settings/pages/common/procedure-rules-settings.svelte'

  const typeLabels: Record<SeatGroupType, string> = $derived({
    cabinet: t('procedure_cabinet'),
    mpc: 'MPC',
    ipc: 'IPC'
  })

  const isSingleton = $derived(wizard.mode === 'singleton')
  const showNoCommittees = $derived(wizard.attempted && wizard.committees.length === 0)
  let activeTabs = $state<Record<string, string>>({})
</script>

<section class="flex flex-col gap-4">
  {#if isSingleton}
    <p class="text-sm text-muted-foreground">{t('procedure_singleton_mode_has_exactly_one_committee')}</p>
  {/if}

  {#if showNoCommittees}
    <Field.FieldError>{t('procedure_add_at_least_one_committee')}</Field.FieldError>
  {/if}

  {#each wizard.committees as committee (committee.id)}
    {@const showNameError = wizard.attempted && committee.name.trim().length === 0}
    <article class="rounded-lg border p-4">
      <div
        class={isSingleton
          ? 'grid items-start gap-y-3'
          : 'grid items-start gap-x-4 gap-y-3 md:grid-cols-[minmax(0,1fr)_11rem_auto]'}
      >
        <Field.Field data-invalid={showNameError}>
          <Field.FieldLabel for={`committee-name-${committee.id}`}>{t('procedure_committee_name')}</Field.FieldLabel>
          <Input
            id={`committee-name-${committee.id}`}
            bind:value={committee.name}
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? `committee-name-error-${committee.id}` : undefined}
          />
          {#if showNameError}
            <Field.FieldError id={`committee-name-error-${committee.id}`}>
              {t('procedure_committee_name_is_required')}
            </Field.FieldError>
          {/if}
        </Field.Field>

        {#if !isSingleton}
          <Field.Field>
            <Field.FieldLabel for={`committee-type-${committee.id}`}>{t('procedure_type')}</Field.FieldLabel>
            <Select.Select type="single" bind:value={committee.type}>
              <Select.SelectTrigger id={`committee-type-${committee.id}`} class="w-full">
                {typeLabels[committee.type]}
              </Select.SelectTrigger>
              <Select.SelectContent>
                <Select.SelectItem value="cabinet" label={t('procedure_cabinet')} />
                <Select.SelectItem value="mpc" label="MPC" />
                <Select.SelectItem value="ipc" label="IPC" />
              </Select.SelectContent>
            </Select.Select>
          </Field.Field>
        {/if}

        {#if !isSingleton}
          <div class="flex items-center justify-end md:pt-6">
            <Button
              variant="ghost"
              size="icon"
              title={t('procedure_delete_committee')}
              onclick={() => wizard.removeCommittee(committee.id)}
            >
              <Trash2 class="text-destructive" />
            </Button>
          </div>
        {/if}
      </div>
      <Tabs.Root
        value={activeTabs[committee.id] ?? 'details'}
        onValueChange={(value) => (activeTabs[committee.id] = value)}
        class="mt-4"
      >
        <Tabs.List>
          <Tabs.Trigger value="details">{t('procedure_meeting_details')}</Tabs.Trigger>
          <Tabs.Trigger value="rules">{t('settings_procedure_rules')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="rules" class="mt-4">
          {#key `${committee.id}:${JSON.stringify(committee.procedureRules)}`}
            <ProcedureRulesSettings
              initialRules={committee.procedureRules}
              seats={wizard.procedureSeats(committee.id)}
              vetoMode="seat"
              onSave={(config) => wizard.setCommitteeProcedureRules(committee.id, config)}
            />
          {/key}
        </Tabs.Content>
      </Tabs.Root>
    </article>
  {/each}

  {#if !isSingleton}
    <Button variant="outline" class="w-fit" onclick={() => wizard.addCommittee()}>
      <Plus data-icon="inline-start" />
      {t('procedure_add_committee')}
    </Button>
  {/if}
</section>
