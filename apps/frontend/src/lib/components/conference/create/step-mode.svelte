<script lang="ts">
  import { t } from '$lib/i18n'
  import * as Field from '$lib/components/ui/field'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import type { ConferenceCreateMode } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'

  function isCreateMode(value: string): value is ConferenceCreateMode {
    return value === 'conference' || value === 'singleton'
  }

  function handleModeChange(value: string): void {
    if (isCreateMode(value)) wizard.setMode(value)
  }

  const showModeError = $derived(wizard.attempted && wizard.mode === null)
</script>

<Field.FieldGroup>
  <Field.Field data-invalid={showModeError}>
    <Field.FieldTitle id="conference-mode-label">
      {t('procedure_creation_mode')}
      <span class="text-destructive">*</span>
    </Field.FieldTitle>
    <Field.FieldDescription>{t('procedure_choose_how_to_organize_the_conference_then_enter_its_details')}</Field.FieldDescription>

    <ToggleGroup.Root
      type="single"
      value={wizard.mode ?? undefined}
      onValueChange={handleModeChange}
      aria-labelledby="conference-mode-label"
      class="w-full gap-3"
    >
      <ToggleGroup.Item
        value="conference"
        class="h-auto min-w-0 flex-1 flex-col items-start gap-2 rounded-xl border p-4 text-left"
      >
        <span class="text-sm font-medium">{t('procedure_conference_mode')}</span>
        <span class="text-sm font-normal text-muted-foreground">
          {t('procedure_for_larger_conferences_using_the_existing_creation_workflow')}
        </span>
      </ToggleGroup.Item>

      <ToggleGroup.Item
        value="singleton"
        class="h-auto min-w-0 flex-1 flex-col items-start gap-2 rounded-xl border p-4 text-left"
      >
        <span class="text-sm font-medium">{t('procedure_singleton_mode')}</span>
        <span class="text-sm font-normal text-muted-foreground">
          {t('procedure_for_smaller_conferences_focused_on_a_single_committee')}
        </span>
      </ToggleGroup.Item>
    </ToggleGroup.Root>

    {#if showModeError}
      <Field.FieldError>{t('procedure_choose_a_creation_mode')}</Field.FieldError>
    {/if}
  </Field.Field>
</Field.FieldGroup>
