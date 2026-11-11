<script lang="ts">
  import { renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t } from '$lib/i18n'
  import { TriangleAlert } from '@lucide/svelte'

  import type { CloudJoinTarget } from '$lib/classes/clients/cloud-join-client'
  import * as Alert from '$lib/components/ui/alert'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import * as Dialog from '$lib/components/ui/dialog'

  let {
    open,
    target,
    hasStoredCredential = false,
    isSubmitting = false,
    requestError = '',
    onBack,
    onConfirm,
    onOpenChange
  }: {
    open: boolean
    target: CloudJoinTarget
    hasStoredCredential?: boolean
    isSubmitting?: boolean
    requestError?: ProcedureMessage
    onBack: () => void
    onConfirm: () => void
    onOpenChange: (open: boolean) => void
  } = $props()

  const seatClaimed = $derived(target.seatState === 'claimed')
  const canRejoin = $derived(seatClaimed && (hasStoredCredential || !target.hasPassword))
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{t('procedure_confirm_conference')}</Dialog.Title>
      <Dialog.Description>{t('procedure_confirm_the_conference_and_seat_associated_with_this_invite_code')}</Dialog.Description>
    </Dialog.Header>

    <Card.Root>
      <Card.Header>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <Card.Title>{target.conferenceName}</Card.Title>
            <Card.Description>{target.organizer}</Card.Description>
          </div>
          <Badge variant={seatClaimed ? 'destructive' : 'secondary'}>
            {seatClaimed ? t('procedure_claimed') : t('procedure_available')}
          </Badge>
        </div>
      </Card.Header>
      <Card.Content>
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div class="flex flex-col gap-1">
            <dt class="text-muted-foreground">{t('procedure_committee')}</dt>
            <dd class="font-medium">{target.committeeName}</dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-muted-foreground">{t('procedure_seat')}</dt>
            <dd class="font-medium">{target.seatName}</dd>
          </div>
          <div class="flex flex-col gap-1 sm:col-span-2">
            <dt class="text-muted-foreground">{t('procedure_role')}</dt>
            <dd class="font-medium">{target.roleName}</dd>
          </div>
        </dl>
      </Card.Content>
    </Card.Root>

    {#if canRejoin}
      <Alert.Root>
        <TriangleAlert />
        <Alert.Title>{t('procedure_rejoin')}</Alert.Title>
        <Alert.Description>
          {hasStoredCredential
            ? t('procedure_a_joining_password_was_found_on_this_device_confirm_to_rejoin_this_seat_directly')
            : t('procedure_this_seat_has_no_joining_password_confirm_to_rejoin_directly')}
        </Alert.Description>
      </Alert.Root>
    {:else if seatClaimed}
      <Alert.Root variant="destructive">
        <TriangleAlert />
        <Alert.Title>{t('procedure_this_seat_has_been_claimed')}</Alert.Title>
        <Alert.Description>{t('procedure_no_valid_joining_password_was_found_on_this_device_continue_to_enter_it_again')}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if requestError}
      <Alert.Root variant="destructive">
        <TriangleAlert />
        <Alert.Title>{t('procedure_unable_to_rejoin')}</Alert.Title>
        <Alert.Description>{renderProcedureMessage(requestError)}</Alert.Description>
      </Alert.Root>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={onBack} disabled={isSubmitting}>{t('procedure_back')}</Button>
      <Button onclick={onConfirm} disabled={isSubmitting}>
        {#if isSubmitting}
          {t('procedure_rejoining')}
        {:else}
          {t('procedure_confirm_conference')}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
