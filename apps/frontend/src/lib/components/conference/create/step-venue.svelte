<script lang="ts">
  import { t } from '$lib/i18n'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'

  const committee = $derived(wizard.committees[0])
  const showNameError = $derived(
    wizard.attempted && (!committee || committee.name.trim().length === 0)
  )
</script>

{#if committee}
  <Field.FieldGroup>
    <Field.Field data-invalid={showNameError}>
      <Field.FieldLabel for="venue-name">
        {t('procedure_committee_name')}<span class="text-destructive"> *</span>
      </Field.FieldLabel>
      <Input
        id="venue-name"
        bind:value={committee.name}
        aria-invalid={showNameError || undefined}
        aria-describedby={showNameError ? 'venue-name-error' : undefined}
      />
      {#if showNameError}
        <Field.FieldError id="venue-name-error">
          {t('procedure_committee_name_is_required')}
        </Field.FieldError>
      {/if}
    </Field.Field>
  </Field.FieldGroup>
{/if}
