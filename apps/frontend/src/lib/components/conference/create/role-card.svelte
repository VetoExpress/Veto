<script lang="ts">
  import { t } from '$lib/i18n'
  import { ChevronDown, Trash2 } from '@lucide/svelte'
  import { cn } from '$lib/classes/utils'
  import type { RoleTemplate } from '$lib/classes/types/event'
  import { CAPABILITY_OPTIONS } from '$lib/classes/types/delegate'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import { Badge } from '$lib/components/ui/badge'
  import { Button, buttonVariants } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'

  let { role }: { role: RoleTemplate } = $props()

  const attempted = $derived(wizard.attempted)
  const showNameError = $derived(attempted && role.name.trim().length === 0)
  const showCapabilitiesError = $derived(
    attempted && role.capabilities.length === 0 && !showNameError
  )
  const usage = $derived(wizard.roleUsage().get(role.id) ?? 0)

  let open = $state(false)

  // 提交校验失败时自动展开权限区，保证错误信息可见
  $effect(() => {
    if (showCapabilitiesError) open = true
  })
</script>

<Collapsible.Root bind:open>
  <article class="rounded-lg border p-4">
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex min-w-60 flex-1 flex-col gap-1.5">
        <Input
          bind:value={role.name}
          placeholder={t('procedure_role_name')}
          aria-label={t('procedure_role_name')}
          aria-invalid={showNameError || undefined}
          class="max-w-72"
        />
        {#if showNameError}
          <Field.FieldError>{t('procedure_enter_role_name')}</Field.FieldError>
        {/if}
      </div>
      <Badge variant={showCapabilitiesError ? 'destructive' : 'outline'}>
        {t('procedure_capability_count', { value1: role.capabilities.length })}
      </Badge>
      <Collapsible.Trigger
        aria-label={open ? t('procedure_collapse_capabilities') : t('procedure_expand_capabilities')}
        title={open ? t('procedure_collapse_capabilities') : t('procedure_expand_capabilities')}
        class={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'transition-transform',
          open && 'rotate-180'
        )}
      >
        <ChevronDown />
        <span class="sr-only">{open ? t('procedure_collapse_capabilities') : t('procedure_expand_capabilities')}</span>
      </Collapsible.Trigger>
      <Button
        variant="ghost"
        size="icon"
        title={usage > 0 ? t('procedure_this_role_is_assigned_to_a_seat') : t('procedure_delete_role')}
        disabled={usage > 0}
        onclick={() => wizard.removeRole(role.id)}
      >
        <Trash2 class="text-destructive" />
      </Button>
    </div>

    <Collapsible.Content>
      <Field.FieldSet class="mt-4">
        <Field.FieldLegend variant="label">{t('procedure_capabilities_2')}</Field.FieldLegend>
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {#each CAPABILITY_OPTIONS as option (option.value)}
            <label
              for={`capability-${role.id}-${option.value}`}
              class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[[data-slot='checkbox']]:hover:bg-accent/50"
            >
              <Checkbox
                id={`capability-${role.id}-${option.value}`}
                checked={role.capabilities.includes(option.value)}
                onCheckedChange={() => wizard.toggleCapability(role.id, option.value)}
              />
              <span class="min-w-0">{option.label}</span>
            </label>
          {/each}
        </div>
        {#if showCapabilitiesError}
          <Field.FieldError>{t('procedure_select_at_least_one_capability')}</Field.FieldError>
        {/if}
      </Field.FieldSet>
    </Collapsible.Content>
  </article>
</Collapsible.Root>
