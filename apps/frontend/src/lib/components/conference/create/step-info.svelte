<script lang="ts">
  import { t } from '$lib/i18n'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'

  const showNameError = $derived(wizard.attempted && wizard.eventName.trim().length === 0)
</script>

<Field.FieldGroup>
  <Field.Field data-invalid={showNameError}>
    <Field.FieldLabel for="event-name">
      {t('procedure_conference_name')}<span class="text-destructive"> *</span>
    </Field.FieldLabel>
    <Input
      id="event-name"
      bind:value={wizard.eventName}
      aria-invalid={showNameError || undefined}
      aria-describedby={showNameError ? 'event-name-error' : undefined}
    />
    {#if showNameError}
      <Field.FieldError id="event-name-error">{t('procedure_enter_conference_name')}</Field.FieldError>
    {/if}
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel for="organizer">{t('procedure_organizer_2')}</Field.FieldLabel>
    <Input id="organizer" bind:value={wizard.organizer} placeholder={t('procedure_organizing_institution_or_organization')} />
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel for="event-description">{t('procedure_conference_description')}</Field.FieldLabel>
    <Textarea
      id="event-description"
      bind:value={wizard.eventDescription}
      class="min-h-28"
      placeholder={t('procedure_conference_topic_scope_or_notes')}
    />
  </Field.Field>
</Field.FieldGroup>
