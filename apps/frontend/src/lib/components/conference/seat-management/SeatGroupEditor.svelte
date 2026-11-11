<script lang="ts">
  import { t } from '$lib/i18n'
  import type { Capability, SeatGroup, SeatGroupType } from '$lib/classes/types/delegate'
  import { CAPABILITY_OPTIONS } from '$lib/classes/types/delegate'
  import { addSeatGroup, updateSeatGroup } from '$lib/classes/stores/delegate/delegate-store'
  import { Button } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'

  interface Props {
    editingGroup?: SeatGroup | null
    onClose: () => void
  }

  let { editingGroup, onClose }: Props = $props()

  let name = $state(editingGroup?.name ?? '')
  let type = $state<SeatGroupType>(editingGroup?.type ?? 'cabinet')
  let selectedCapabilities = $state<Set<Capability>>(
    new Set(editingGroup?.defaultCapabilities ?? ['view_conference'])
  )

  const typeLabels: Record<SeatGroupType, string> = $derived({
    cabinet: t('procedure_cabinet'),
    mpc: t('procedure_mpc_press_center'),
    ipc: 'IPC'
  })

  function toggleCapability(capability: Capability): void {
    const next = new Set(selectedCapabilities)
    if (next.has(capability)) {
      next.delete(capability)
    } else {
      next.add(capability)
    }
    selectedCapabilities = next
  }

  function handleSave(): void {
    const nameTrimmed = name.trim()
    if (!nameTrimmed) return

    if (editingGroup) {
      updateSeatGroup(editingGroup.id, {
        name: nameTrimmed,
        type,
        defaultCapabilities: Array.from(selectedCapabilities)
      })
    } else {
      addSeatGroup(nameTrimmed, type, Array.from(selectedCapabilities))
    }
    onClose()
  }
</script>

<div class="flex flex-col gap-4 rounded-lg border p-4">
  <h4 class="text-base font-semibold">
    {editingGroup ? t('procedure_edit_seat_group') : t('procedure_new_seat_group')}
  </h4>

  <Field.FieldGroup class="gap-3">
    <Field.Field>
      <Field.FieldLabel for="sg-name">{t('procedure_name_2')}</Field.FieldLabel>
      <Input id="sg-name" bind:value={name} placeholder={t('procedure_for_example_cabinet_mpc_ipc')} />
    </Field.Field>

    <Field.Field>
      <Field.FieldLabel for="sg-type">{t('procedure_type')}</Field.FieldLabel>
      <Select.Select type="single" bind:value={type}>
        <Select.SelectTrigger id="sg-type" class="w-full">
          {typeLabels[type]}
        </Select.SelectTrigger>
        <Select.SelectContent>
          <Select.SelectItem value="cabinet" label={t('procedure_cabinet')} />
          <Select.SelectItem value="mpc" label={t('procedure_mpc_press_center')} />
          <Select.SelectItem value="ipc" label="IPC" />
        </Select.SelectContent>
      </Select.Select>
    </Field.Field>
  </Field.FieldGroup>

  <Field.FieldSet>
    <Field.FieldLegend variant="label">{t('procedure_default_capabilities')}</Field.FieldLegend>
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {#each CAPABILITY_OPTIONS as option (option.value)}
        <label
          for={`sg-cap-${option.value}`}
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <Checkbox
            id={`sg-cap-${option.value}`}
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
      {editingGroup ? t('procedure_save') : t('procedure_create')}
    </Button>
  </div>
</div>
