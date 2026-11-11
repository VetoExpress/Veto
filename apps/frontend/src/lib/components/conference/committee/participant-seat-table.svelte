<script lang="ts">
  import { t } from '$lib/i18n'
  import { onDestroy } from 'svelte'
  import { Check, Pencil, Trash2, X } from '@lucide/svelte'
  import type { ParticipantSeat } from '$lib/classes/types/delegate'
  import { removeSeat, updateSeat } from '$lib/classes/stores/delegate/delegate-store'
  import {
    changeSeatAttendance,
    setSeatVotingRights
  } from '$lib/classes/stores/conference/conference-store'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { cn } from '$lib/classes/utils.js'

  interface Props {
    seats: ParticipantSeat[]
  }

  let { seats }: Props = $props()

  let editingSeatId = $state('')
  let editName = $state('')
  let editShortName = $state('')
  let deleteConfirmSeatId = $state('')
  let deleteConfirmTimer: ReturnType<typeof setTimeout> | undefined

  function startEditing(seat: ParticipantSeat): void {
    clearDeleteConfirmation()
    editingSeatId = seat.id
    editName = seat.name
    editShortName = seat.shortName ?? ''
  }

  function cancelEditing(): void {
    editingSeatId = ''
    editName = ''
    editShortName = ''
  }

  function saveSeat(seat: ParticipantSeat): void {
    const name = editName.trim()
    if (!name) return
    updateSeat(seat.id, { name, shortName: editShortName.trim() || undefined })
    cancelEditing()
  }

  function handleEditorKeydown(event: KeyboardEvent, seat: ParticipantSeat): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveSeat(seat)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  function clearDeleteConfirmation(): void {
    if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = undefined
    deleteConfirmSeatId = ''
  }

  function handleDelete(seat: ParticipantSeat): void {
    if (deleteConfirmSeatId !== seat.id) {
      clearDeleteConfirmation()
      deleteConfirmSeatId = seat.id
      deleteConfirmTimer = setTimeout(clearDeleteConfirmation, 3000)
      return
    }

    clearDeleteConfirmation()
    if (editingSeatId === seat.id) cancelEditing()
    removeSeat(seat.id)
  }

  function handleAttendanceChange(seatId: string, value: string): void {
    changeSeatAttendance(seatId, value as 'present' | 'absent')
  }

  onDestroy(clearDeleteConfirmation)
</script>

<div class="overflow-hidden rounded-lg border bg-card">
  <table class="w-full text-sm">
    <thead class="bg-muted/50 text-xs text-muted-foreground">
      <tr>
        <th class="px-4 py-3 text-left font-medium">{t('procedure_seat')}</th>
        <th class="px-4 py-3 text-left font-medium">{t('procedure_abbreviation')}</th>
        <th class="w-36 px-4 py-3 text-center font-medium">{t('procedure_attendance')}</th>
        <th class="w-24 px-4 py-3 text-center font-medium">{t('procedure_voting_rights')}</th>
        <th class="px-4 py-3 text-right font-medium">{t('procedure_actions')}</th>
      </tr>
    </thead>
    <tbody>
      {#each seats as seat (seat.id)}
        {@const isPresent = seat.procedure.attendance === 'present'}
        {@const isObserver = isPresent && !seat.procedure.hasVotingRights}
        <tr class="border-t">
          <td class="px-4 py-3 font-medium">
            {#if editingSeatId === seat.id}
              <Input
                bind:value={editName}
                aria-label={t('procedure_seat_name')}
                onkeydown={(event) => handleEditorKeydown(event, seat)}
              />
            {:else}
              <div class="flex items-center gap-2">
                <span
                  class={cn(
                    'truncate text-sm font-medium',
                    !isPresent && 'text-muted-foreground/50 line-through'
                  )}
                >
                  {seat.name}
                </span>
                {#if isObserver}
                  <Badge variant="outline">{t('procedure_observer')}</Badge>
                {/if}
              </div>
            {/if}
          </td>
          <td class="px-4 py-3 font-medium">
            {#if editingSeatId === seat.id}
              <Input
                bind:value={editShortName}
                aria-label={t('procedure_seat_abbreviation')}
                placeholder={t('procedure_optional')}
                onkeydown={(event) => handleEditorKeydown(event, seat)}
              />
            {:else}
              {seat.shortName ?? '-'}
            {/if}
          </td>
          <td class="px-4 py-3">
            <div class="flex justify-center">
              <ToggleGroup.Root
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={seat.procedure.attendance}
                onValueChange={(value: string) => handleAttendanceChange(seat.id, value)}
                aria-label={t('procedure_set_attendance_for_value', { value1: seat.name })}
              >
                <ToggleGroup.Item
                  value="present"
                  class="data-[state=on]:border-blue-300 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700 dark:data-[state=on]:border-blue-700 dark:data-[state=on]:bg-blue-950/60 dark:data-[state=on]:text-blue-300"
                >
                  {t('procedure_present_2')}
                </ToggleGroup.Item>
                <ToggleGroup.Item
                  value="absent"
                  class="data-[state=on]:border-red-300 data-[state=on]:bg-red-100 data-[state=on]:text-red-700 dark:data-[state=on]:border-red-700 dark:data-[state=on]:bg-red-950/60 dark:data-[state=on]:text-red-300"
                >
                  {t('procedure_absent')}
                </ToggleGroup.Item>
              </ToggleGroup.Root>
            </div>
          </td>
          <td class="px-4 py-3">
            <div class="flex justify-center">
              <Switch
                checked={seat.procedure.hasVotingRights}
                disabled={!isPresent}
                onCheckedChange={(hasVotingRights: boolean) =>
                  setSeatVotingRights(seat.id, hasVotingRights)}
                title={isPresent
                  ? seat.procedure.hasVotingRights
                    ? t('procedure_has_voting_rights')
                    : t('procedure_observer_no_voting_rights')
                  : t('procedure_absent_voting_rights_cannot_be_changed')}
                aria-label={t('procedure_set_voting_rights_for_value', { value1: seat.name })}
              />
            </div>
          </td>
          <td class="px-4 py-3">
            <div class="flex justify-end gap-1">
              {#if editingSeatId === seat.id}
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('procedure_cancel_editing')}
                  aria-label={t('procedure_cancel_editing')}
                  onclick={cancelEditing}
                >
                  <X />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('procedure_save_seat')}
                  aria-label={t('procedure_save_seat')}
                  disabled={!editName.trim()}
                  onclick={() => saveSeat(seat)}
                >
                  <Check />
                </Button>
              {:else}
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('procedure_edit_seat')}
                  aria-label={t('procedure_edit_seat')}
                  onclick={() => startEditing(seat)}
                >
                  <Pencil />
                </Button>
              {/if}
              <Button
                variant={deleteConfirmSeatId === seat.id ? 'destructive' : 'ghost'}
                size="sm"
                title={t('procedure_double_click_to_delete_seat')}
                onclick={() => handleDelete(seat)}
              >
                <Trash2 data-icon="inline-start" />
                {#key deleteConfirmSeatId === seat.id}
                  {t('procedure_delete')}
                {/key}
              </Button>
            </div>
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="5" class="px-4 py-10 text-center text-muted-foreground">{t('procedure_no_participants')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
