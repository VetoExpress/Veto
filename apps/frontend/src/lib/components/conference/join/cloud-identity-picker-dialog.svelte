<script lang="ts">
  import { t, getLocale } from '$lib/i18n'
  import { Armchair, Clock } from '@lucide/svelte'

  import type { CloudMembership } from '$lib/classes/stores/conference/cloud-membership-store'
  import { Badge } from '$lib/components/ui/badge'
  import * as Dialog from '$lib/components/ui/dialog'

  let {
    open,
    memberships,
    description,
    onSelect,
    onOpenChange
  }: {
    open: boolean
    memberships: CloudMembership[]
    description: string
    onSelect: (membership: CloudMembership) => void
    onOpenChange: (open: boolean) => void
  } = $props()

  function identityTitle(membership: CloudMembership): string {
    if (membership.isChair) return t('procedure_chair')
    return membership.seatShortName || membership.seatName
  }

  function identitySubtitle(membership: CloudMembership): string {
    const parts = [
      membership.isChair ? (membership.chairCommitteeName ?? membership.committeeName) : membership.committeeName
    ]
    if (!membership.isChair) parts.push(membership.roleName)
    parts.push(membership.displayName)
    return parts.join(' · ')
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' })
  }

  function handleSelect(membership: CloudMembership): void {
    onOpenChange(false)
    onSelect(membership)
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('procedure_choose_identity')}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>

    <div class="flex max-h-80 flex-col gap-2 overflow-y-auto">
      {#each memberships as membership (membership.seatId)}
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-lg border bg-card/70 px-4 py-3 text-left transition-all hover:border-primary/50 hover:bg-accent/50"
          onclick={() => handleSelect(membership)}
        >
          <div class="flex min-w-0 items-center gap-3">
            <div
              class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <Armchair class="size-4" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{identityTitle(membership)}</p>
              <p class="truncate text-xs text-muted-foreground">{identitySubtitle(membership)}</p>
            </div>
          </div>
          <Badge variant="outline" class="shrink-0 text-[10px]">
            <Clock class="size-3" />
            {formatTime(membership.updatedAt)}
          </Badge>
        </button>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
