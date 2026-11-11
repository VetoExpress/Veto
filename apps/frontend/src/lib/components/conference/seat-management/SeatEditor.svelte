<script lang="ts">
  import { t } from '$lib/i18n'
  import type { Capability, Seat } from '$lib/classes/types/delegate'
  import { CAPABILITY_OPTIONS } from '$lib/classes/types/delegate'
  import { addSeat, updateSeat } from '$lib/classes/stores/delegate/delegate-store'
  import { currentConferenceRecord } from '$lib/classes/stores/conference/conference-store'
  import { Button } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'

  interface Props {
    seatGroupId: string
    editingSeat?: Seat | null
    onClose: () => void
  }

  let { seatGroupId, editingSeat, onClose }: Props = $props()

  let name = $state(editingSeat?.name ?? '')
  let roleId = $state(editingSeat?.roleId ?? '')

  // 能力覆盖：勾选 = 强制开启；未勾选 = 不写入覆盖（沿用席位组默认）
  let selectedCapabilities = $state<Set<Capability>>(
    new Set(
      editingSeat
        ? Object.entries(editingSeat.capabilityOverrides ?? {})
            .filter(([, enabled]) => enabled)
            .map(([capability]) => capability as Capability)
        : []
    )
  )

  function toggleCapability(capability: Capability): void {
    const next = new Set(selectedCapabilities)
    if (next.has(capability)) {
      next.delete(capability)
    } else {
      next.add(capability)
    }
    selectedCapabilities = next
  }

  function overridesFromSelection(): Partial<Record<Capability, boolean>> {
    return Object.fromEntries(
      CAPABILITY_OPTIONS.filter((option) => selectedCapabilities.has(option.value)).map(
        (option) => [option.value, true]
      )
    )
  }

  function handleSave(): void {
    const nameTrimmed = name.trim()
    if (!nameTrimmed) return

    const capabilityOverrides = overridesFromSelection()

    if (editingSeat) {
      updateSeat(editingSeat.id, {
        name: nameTrimmed,
        roleId: roleId || undefined,
        role: $currentConferenceRecord?.roleTemplates.find((template) => template.id === roleId)?.name,
        capabilityOverrides
      })
    } else {
      addSeat(nameTrimmed, seatGroupId, roleId || undefined, capabilityOverrides)
    }
    onClose()
  }
</script>

<div class="flex flex-col gap-4 rounded-lg border p-4">
  <h4 class="text-base font-semibold">
    {editingSeat ? t('procedure_edit_seat') : t('procedure_new_seat')}
  </h4>

  <Field.FieldGroup class="gap-3">
    <Field.Field>
      <Field.FieldLabel for="seat-name">{t('procedure_seat_name')}</Field.FieldLabel>
      <Input id="seat-name" bind:value={name} placeholder={t('procedure_for_example_navy_minister_news_agency_reporter')} />
    </Field.Field>

    <Field.Field>
      <Field.FieldLabel for="seat-role">{t('procedure_role_templates')}</Field.FieldLabel>
      <select id="seat-role" bind:value={roleId} class="h-9 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">{t('procedure_no_role_template')}</option>
        {#each $currentConferenceRecord?.roleTemplates ?? [] as template (template.id)}
          <option value={template.id}>{template.name}</option>
        {/each}
      </select>
    </Field.Field>
  </Field.FieldGroup>

  <Field.FieldSet>
    <Field.FieldLegend variant="label">{t('procedure_capability_overrides')}</Field.FieldLegend>
    <p class="-mt-2 text-xs text-muted-foreground">
      {t('procedure_checked_enable_explicitly_unchecked_use_seat_group_defaults')}
    </p>
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {#each CAPABILITY_OPTIONS as option (option.value)}
        <label
          for={`seat-cap-${option.value}`}
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <Checkbox
            id={`seat-cap-${option.value}`}
            checked={selectedCapabilities.has(option.value)}
            onCheckedChange={() => toggleCapability(option.value)}
          />
          <span class="min-w-0">{option.label}</span>
        </label>
      {/each}
    </div>
  </Field.FieldSet>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onClose}>{t('procedure_cancel')}</Button>
    <Button onclick={handleSave} disabled={!name.trim()}>
      {editingSeat ? t('procedure_save') : t('procedure_create')}
    </Button>
  </div>
</div>
