<script lang="ts">
  import { t } from '$lib/i18n'
  import { ChevronDown } from '@lucide/svelte'
  import { cn } from '$lib/classes/utils'
  import { Badge } from '$lib/components/ui/badge'
  import { buttonVariants } from '$lib/components/ui/button'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import type { CommitteeDraft } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'

  let { committee, isSingleton }: { committee: CommitteeDraft; isSingleton: boolean } = $props()

  let open = $state(true)
</script>

<Collapsible.Root bind:open>
  <article class="rounded-lg border p-4">
    <div class="flex items-center gap-3">
      <h3 class="min-w-0 flex-1 truncate text-sm font-semibold">{committee.name}</h3>
      <Badge variant="outline">{t('procedure_seat_count', { value1: committee.seats.length })}</Badge>
      <Collapsible.Trigger
        aria-label={open ? t('procedure_collapse_seats') : t('procedure_expand_seats')}
        title={open ? t('procedure_collapse_seats') : t('procedure_expand_seats')}
        class={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'transition-transform',
          open && 'rotate-180'
        )}
      >
        <ChevronDown />
        <span class="sr-only">{open ? t('procedure_collapse_seats') : t('procedure_expand_seats')}</span>
      </Collapsible.Trigger>
    </div>

    <Collapsible.Content>
      <ul class="mt-3 flex flex-col gap-2 text-sm">
        {#each committee.seats as seat (seat.id)}
          <li class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div class="min-w-0 flex-1 truncate">
              <span>{seat.name}</span>
              {#if committee.type === 'cabinet' && seat.shortName.trim()}
                <span class="ml-2 text-xs text-muted-foreground">({seat.shortName})</span>
              {/if}
            </div>
            {#if !isSingleton}
              <span class="shrink-0 text-xs text-muted-foreground">
                {wizard.roleName(seat.roleId ?? '')}
              </span>
            {/if}
            {#if isSingleton && seat.hasVotingRights}
              <Badge variant="secondary" class="bg-blue-500 text-white dark:bg-blue-600">
                {t('procedure_voting_rights')}
              </Badge>
            {/if}
            {#if committee.type === 'cabinet' && seat.hasVetoPower}
              <Badge variant="secondary" class="bg-amber-500 text-white dark:bg-amber-600">
                {t('procedure_veto_rights')}
              </Badge>
            {/if}
          </li>
        {/each}
      </ul>
    </Collapsible.Content>
  </article>
</Collapsible.Root>
