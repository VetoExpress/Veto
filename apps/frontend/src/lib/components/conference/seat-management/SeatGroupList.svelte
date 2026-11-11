<script lang="ts">
  import { t } from '$lib/i18n'
  import type { SeatGroup } from '$lib/classes/types/delegate'
  import { seatGroups } from '$lib/classes/stores/delegate/delegate-store'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Edit3, Users } from '@lucide/svelte'

  interface Props {
    onEdit: (group: SeatGroup) => void
    onSelect: (group: SeatGroup) => void
    onCreateNew: () => void
    selectedId?: string
  }

  let { onEdit, onSelect, onCreateNew, selectedId }: Props = $props()

  const typeLabels: Record<string, string> = $derived({
    cabinet: t('procedure_cabinet'),
    mpc: 'MPC',
    ipc: 'IPC'
  })

  const typeBadgeVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
    cabinet: 'default',
    mpc: 'secondary',
    ipc: 'outline'
  }

</script>

<div class="seat-group-list">
  <div class="header">
    <h3 class="text-lg font-semibold">{t('procedure_seat_groups')}</h3>
    <Button size="sm" variant="outline" onclick={onCreateNew}>
      {t('procedure_new_seat_group_2')}
    </Button>
  </div>

  <div class="groups">
    {#each $seatGroups as group (group.id)}
      <button
        class="group-card"
        class:selected={selectedId === group.id}
        onclick={() => onSelect(group)}
      >
        <div class="group-info">
          <div class="group-name">
            <span>{group.name}</span>
            <Badge variant={typeBadgeVariants[group.type] ?? 'outline'}>
              {typeLabels[group.type] ?? group.type}
            </Badge>
          </div>
          <span class="text-xs text-muted-foreground">
            {t('procedure_default_capability_count', { value1: group.defaultCapabilities.length })}
          </span>
        </div>
        <div class="group-actions">
          <Button size="icon-sm" variant="ghost" onclick={(e) => { e.stopPropagation(); onEdit(group) }}>
            <Edit3 class="size-4" />
          </Button>
        </div>
      </button>
    {/each}
    {#if $seatGroups.length === 0}
      <div class="empty-state">
        <Users class="size-8 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">{t('procedure_no_seat_groups')}</p>
        <p class="text-xs text-muted-foreground">{t('procedure_create_a_seat_group_to_manage_seats')}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .seat-group-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .group-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--background);
    cursor: pointer;
    transition: border-color 0.15s;
    text-align: left;
    width: 100%;
  }
  .group-card:hover {
    border-color: var(--primary);
  }
  .group-card.selected {
    border-color: var(--primary);
    background: var(--accent);
  }
  .group-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .group-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }
  .group-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem;
  }
</style>
