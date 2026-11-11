<script lang="ts">
  import { t } from '$lib/i18n'
  import { ChevronDown } from '@lucide/svelte'
  import { cn } from '$lib/classes/utils'
  import { CAPABILITY_LABELS } from '$lib/classes/types/delegate'
  import type { Capability } from '$lib/classes/types/delegate'
  import { Badge } from '$lib/components/ui/badge'
  import { buttonVariants } from '$lib/components/ui/button'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import MeetingCard from './meeting-card.svelte'

  const capabilityLabel = (capability: Capability): string =>
    CAPABILITY_LABELS[capability] ?? capability

  let rolesOpen = $state(true)
</script>

<section class="flex flex-col gap-5">
  <article class="rounded-lg border p-4">
    <h2 class="truncate text-sm font-semibold">{wizard.eventName || t('procedure_untitled_conference')}</h2>
    <dl
      class={wizard.mode === 'singleton'
        ? 'mt-3 grid gap-3 text-sm sm:grid-cols-3'
        : 'mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4'}
    >
      <div>
        <dt class="text-xs text-muted-foreground">{t('procedure_creation_mode')}</dt>
        <dd class="mt-1 font-medium">
          {wizard.mode === 'singleton' ? t('procedure_singleton_mode') : t('procedure_conference_mode')}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">
          {wizard.mode === 'singleton' ? t('procedure_meeting') : t('procedure_committee')}
        </dt>
        <dd class="mt-1 font-medium">
          {wizard.mode === 'singleton'
            ? wizard.committees[0]?.name || t('procedure_untitled_meeting')
            : wizard.committees.length}
        </dd>
      </div>
      {#if wizard.mode !== 'singleton'}
        <div>
          <dt class="text-xs text-muted-foreground">{t('procedure_role_templates')}</dt>
          <dd class="mt-1 font-medium">{wizard.roles.length}</dd>
        </div>
      {/if}
      <div>
        <dt class="text-xs text-muted-foreground">{t('procedure_seat')}</dt>
        <dd class="mt-1 font-medium">{wizard.totalSeatCount}</dd>
      </div>
    </dl>
  </article>

  <div class="grid gap-4">
    {#each wizard.committees as committee (committee.id)}
      <MeetingCard {committee} isSingleton={wizard.mode === 'singleton'} />
    {/each}
  </div>

  {#if wizard.mode !== 'singleton'}
    <Collapsible.Root bind:open={rolesOpen}>
      <article class="rounded-lg border p-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold">{t('procedure_role_capabilities')}</h3>
          <Collapsible.Trigger
            aria-label={rolesOpen ? t('procedure_collapse_role_capabilities') : t('procedure_expand_role_capabilities')}
            title={rolesOpen ? t('procedure_collapse_role_capabilities') : t('procedure_expand_role_capabilities')}
            class={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'transition-transform',
              rolesOpen && 'rotate-180'
            )}
          >
            <ChevronDown />
            <span class="sr-only">{rolesOpen ? t('procedure_collapse_role_capabilities') : t('procedure_expand_role_capabilities')}</span>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content>
          <div class="mt-3 flex flex-col gap-2">
            {#each wizard.roles as role (role.id)}
              <div class="rounded-md border px-3 py-2">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate text-sm font-medium">{role.name}</span>
                  <Badge variant="outline">{t('procedure_seat_count', { value1: wizard.roleUsage().get(role.id) ?? 0 })}</Badge>
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                  {role.capabilities.map(capabilityLabel).join('、')}
                </p>
              </div>
            {/each}
          </div>
        </Collapsible.Content>
      </article>
    </Collapsible.Root>
  {/if}
  {#if wizard.createError}
    <p class="text-sm text-destructive" role="alert">{wizard.createError}</p>
  {/if}
</section>
