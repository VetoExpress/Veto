<script lang="ts">
  import { t } from '$lib/i18n'
  import { Plus, Trash2 } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import ProcedureRulesSettings from '$lib/components/settings/pages/common/procedure-rules-settings.svelte'

  const committee = $derived(wizard.committees[0])
  const showAgendaError = $derived(
    wizard.attempted &&
      committee?.agendaMode &&
      (committee.agenda.length === 0 ||
        committee.agenda.some((item) => item.title.trim().length === 0))
  )
</script>

{#if committee}
  <section class="flex flex-col gap-8">
    <div>
      <h2 class="mb-1 text-lg font-semibold">{t('procedure_agenda_mode_section')}</h2>
      <p class="mb-4 text-sm text-muted-foreground">
        {t('procedure_agenda_mode_description')}
      </p>

      <div class="flex flex-col gap-4 rounded-lg border p-4">
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm font-medium">{t('procedure_agenda_mode')}</span>
          <Switch
            checked={committee.agendaMode}
            aria-label={t('procedure_agenda_mode')}
            onCheckedChange={(checked) =>
              wizard.setCommitteeAgendaMode(committee.id, checked)}
          />
        </div>

        {#if committee.agendaMode}
          <div class="flex flex-col gap-2">
            {#each committee.agenda as item, index (item.id)}
              <div class="flex items-center gap-2">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                >
                  {index + 1}
                </span>
                <Input
                  bind:value={item.title}
                  class="h-9"
                  placeholder={t('procedure_agenda_item_title')}
                  aria-label={t('procedure_agenda_item_title')}
                  aria-invalid={wizard.attempted && item.title.trim().length === 0
                    ? true
                    : undefined}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="shrink-0"
                  title={t('procedure_remove_agenda_item')}
                  aria-label={t('procedure_remove_agenda_item')}
                  onclick={() => wizard.removeCommitteeAgendaItem(committee.id, item.id)}
                >
                  <Trash2 class="text-destructive" />
                </Button>
              </div>
            {/each}
            <Button
              variant="outline"
              size="sm"
              class="w-fit"
              onclick={() => wizard.addCommitteeAgendaItem(committee.id)}
            >
              <Plus data-icon="inline-start" />
              {t('procedure_add_agenda_item')}
            </Button>
          </div>
        {/if}

        {#if showAgendaError}
          <Field.FieldError>{t('procedure_agenda_items_required')}</Field.FieldError>
        {/if}
      </div>
    </div>

    <div>
      {#key `${committee.id}:${JSON.stringify(committee.procedureRules)}`}
        <ProcedureRulesSettings
          initialRules={committee.procedureRules}
          seats={wizard.procedureSeats(committee.id)}
          onSave={(config) => wizard.setCommitteeProcedureRules(committee.id, config)}
        />
      {/key}
    </div>
  </section>
{/if}
