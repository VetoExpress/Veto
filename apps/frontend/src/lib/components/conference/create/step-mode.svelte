<script lang="ts">
  import * as Field from '$lib/components/ui/field'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import type { ConferenceCreateMode } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import { Button } from '$lib/components/ui/button'

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
      创建模式
      <span class="text-destructive">*</span>
    </Field.FieldTitle>
    <Field.FieldDescription>请先选择会议组织方式，然后继续填写大会信息.</Field.FieldDescription>
    <Field.FieldDescription>
      请前往<Button
        variant="link"
        onclick={() => window.location.replace('https://platform.miaoyww.top/?from=app')}
      >
        Veto平台
      </Button>创建大会.
    </Field.FieldDescription>

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
        disabled
      >
        <span class="text-sm font-medium">大会模式</span>
        <span class="text-sm font-normal text-muted-foreground">
          用于组织较大型的会议，与现有创建流程一致。
        </span>
      </ToggleGroup.Item>

      <ToggleGroup.Item
        value="singleton"
        class="h-auto min-w-0 flex-1 flex-col items-start gap-2 rounded-xl border p-4 text-left"
      >
        <span class="text-sm font-medium">单例模式</span>
        <span class="text-sm font-normal text-muted-foreground">
          用于组织较小型的会议，聚焦于大会中的一场会议。
        </span>
      </ToggleGroup.Item>
    </ToggleGroup.Root>

    {#if showModeError}
      <Field.FieldError>请选择创建模式</Field.FieldError>
    {/if}
  </Field.Field>
</Field.FieldGroup>
