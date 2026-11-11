<script lang="ts">
  import { t } from '$lib/i18n'
  import type { Seat } from '$lib/classes/types/delegate'
  import { Button } from '$lib/components/ui/button'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '$lib/components/ui/dialog'
  import { Copy, Check, RefreshCw } from '@lucide/svelte'
  import { currentConferenceRecord } from '$lib/classes/stores/conference/conference-store'
  import { rotateSeatInviteCode } from '$lib/classes/stores/delegate/delegate-store'

  interface Props {
    seat: Seat | null
    conferenceId: string
    onClose: () => void
  }

  let { seat, conferenceId, onClose }: Props = $props()

  let copied = $state(false)
  const inviteCode = $derived(
    seat
      ? ($currentConferenceRecord?.seatAccesses.find((access) => access.seatId === seat.id)
          ?.inviteCode ?? '')
      : ''
  )
  const user = $derived(
    seat?.userId
      ? $currentConferenceRecord?.users.find((item) => item.id === seat.userId)
      : undefined
  )

  function copyInviteInfo(): void {
    if (!seat) return
    const text = [
      t('procedure_conference_id_value', { value1: conferenceId }),
      t('procedure_seat_value', { value1: seat.name }),
      t('procedure_invite_code_value', { value1: inviteCode }),
      t('procedure_password_value', { value1: user?.passwordHash ? t('procedure_set_by_user') : t('procedure_not_set_required_on_first_claim') }),
      ``,
      t('procedure_how_to_join', {  }),
      t('procedure_1_open_the_veto_app', {  }),
      t('procedure_2_select_join_conference_on_the_home_page', {  }),
      t('procedure_3_enter_the_invite_code_on_first_claim_provide_a_name_and_password_both_required', {  })
    ].join('\n')

    navigator.clipboard.writeText(text)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  function copyInviteCode(): void {
    if (!seat) return
    navigator.clipboard.writeText(inviteCode)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  function rotateInviteCode(): void {
    if (!seat) return
    rotateSeatInviteCode(seat.id)
    copied = false
  }
</script>

{#if seat}
  <Dialog open={true} onOpenChange={() => onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('procedure_invitation_title', { value1: seat.name })}</DialogTitle>
        <DialogDescription>
          {t('procedure_share_this_information_with_participants_their_first_connection_claims_the_seat_and_cr')}
        </DialogDescription>
      </DialogHeader>

      <div class="invite-details">
        <div class="detail-row">
          <span class="detail-label">{t('procedure_seat')}</span>
          <span class="detail-value">{seat.name}</span>
        </div>
        {#if seat.role}
          <div class="detail-row">
            <span class="detail-label">{t('procedure_position')}</span>
            <span class="detail-value">{seat.role}</span>
          </div>
        {/if}
        <div class="detail-row">
          <span class="detail-label">{t('procedure_invite_code')}</span>
          <div class="code-row">
            <code class="invite-code-large">{inviteCode}</code>
            <Button size="icon-sm" variant="ghost" onclick={copyInviteCode}>
              {#if copied}
                <Check class="size-4 text-green-500" />
              {:else}
                <Copy class="size-4" />
              {/if}
            </Button>
            <Button size="icon-sm" variant="ghost" title={t('procedure_rotate_invite_code')} onclick={rotateInviteCode}>
              <RefreshCw class="size-4" />
            </Button>
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-label">{t('procedure_conference_id')}</span>
          <span class="detail-value text-xs font-mono">{conferenceId}</span>
        </div>
      </div>

      <div class="invite-actions">
        <Button variant="outline" onclick={onClose}>{t('procedure_close')}</Button>
        <Button onclick={copyInviteInfo}>
          <Copy class="size-4 mr-1" />
          {t('procedure_copy_invitation')}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
{/if}

<style>
  .invite-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .detail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .detail-label {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .detail-value {
    font-weight: 500;
  }
  .code-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .invite-code-large {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    font-family: monospace;
    background: var(--muted);
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius);
  }
  .invite-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
