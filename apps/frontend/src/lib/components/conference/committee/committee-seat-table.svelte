<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * committee-seat-table.svelte
   * ───────────────────────────
   * 席位表 —— 席位名称 / 简称 / 角色 / 访问 key，并就地提供
   * 复制 key、重新生成 key、编辑和删除席位等操作。
   * 依赖当前委员会已加载（席位操作均作用于当前委员会）。
   */
  import { onDestroy } from 'svelte'
  import { Check, Copy, Pencil, RefreshCw, Trash2, X } from '@lucide/svelte'
  import type { Seat, SeatAccess } from '$lib/classes/types/delegate'
  import {
    removeSeat,
    rotateSeatInviteCode,
    updateSeat
  } from '$lib/classes/stores/delegate/delegate-store'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'

  interface Props {
    seats: Seat[]
    /** 大会级访问记录，用于解析每个席位的邀请码 */
    seatAccesses?: SeatAccess[]
  }

  let { seats, seatAccesses = [] }: Props = $props()

  let copied = $state('')
  let editingSeatId = $state('')
  let editName = $state('')
  let editShortName = $state('')
  let deleteConfirmSeatId = $state('')
  let deleteConfirmTimer: ReturnType<typeof setTimeout> | undefined

  function inviteCode(seatId: string): string {
    return seatAccesses.find((access) => access.seatId === seatId)?.inviteCode ?? ''
  }

  async function copyCode(code: string, seatId: string): Promise<void> {
    if (!code) return
    await navigator.clipboard.writeText(code)
    copied = seatId
    setTimeout(() => copied === seatId && (copied = ''), 1400)
  }

  function startEditing(seat: Seat): void {
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

  function saveSeat(seat: Seat): void {
    const name = editName.trim()
    if (!name) return
    updateSeat(seat.id, { name, shortName: editShortName.trim() || undefined })
    cancelEditing()
  }

  function handleEditorKeydown(event: KeyboardEvent, seat: Seat): void {
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

  function handleDelete(seat: Seat): void {
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

  onDestroy(clearDeleteConfirmation)
</script>

<div class="overflow-hidden rounded-lg border bg-card">
  <table class="w-full text-sm">
    <thead class="bg-muted/50 text-xs text-muted-foreground">
      <tr>
        <th class="px-4 py-3 text-left font-medium">{t('procedure_seat')}</th>
        <th class="px-4 py-3 text-left font-medium">{t('procedure_abbreviation')}</th>
        <th class="px-4 py-3 text-left font-medium">{t('procedure_role')}</th>
        <th class="px-4 py-3 text-left font-medium">{t('procedure_access_key')}</th>
        <th class="px-4 py-3 text-right font-medium">{t('procedure_actions')}</th>
      </tr>
    </thead>
    <tbody>
      {#each seats as seat (seat.id)}
        {@const code = inviteCode(seat.id)}
        <tr class="border-t">
          <td class="px-4 py-3 font-medium">
            {#if editingSeatId === seat.id}
              <Input
                bind:value={editName}
                aria-label={t('procedure_seat_name')}
                onkeydown={(event) => handleEditorKeydown(event, seat)}
              />
            {:else}
              {seat.name}
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
          <td class="px-4 py-3 text-muted-foreground">{seat.role ?? '-'}</td>
          <td class="px-4 py-3"><code class="font-mono text-xs">{code || t('procedure_not_generated')}</code></td>
          <td class="px-4 py-3">
            <div class="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                title={t('procedure_copy_key')}
                aria-label={t('procedure_copy_key')}
                disabled={!code}
                onclick={() => void copyCode(code, seat.id)}
              >
                {#if copied === seat.id}<Check />{:else}<Copy />{/if}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={t('procedure_regenerate_key')}
                aria-label={t('procedure_regenerate_key')}
                onclick={() => rotateSeatInviteCode(seat.id)}
              >
                <RefreshCw />
              </Button>
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
          <td colspan="5" class="px-4 py-10 text-center text-muted-foreground">{t('procedure_no_seats')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
