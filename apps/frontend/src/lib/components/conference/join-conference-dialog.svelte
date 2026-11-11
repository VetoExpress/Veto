<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t } from '$lib/i18n'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { CircleAlert, ClipboardPaste, X } from '@lucide/svelte'
  import { REGEXP_ONLY_DIGITS_AND_CHARS } from 'bits-ui'

  import {
    authenticateCloudSeat,
    CloudJoinError,
    validateCloudInvite,
    type CloudClaimResult,
    type CloudJoinTarget
  } from '$lib/classes/clients/cloud-join-client'
  import {
    getCloudMembershipByInviteCode,
    getCloudMembershipPassword,
    rememberCloudMembership,
    type CloudMembership
  } from '$lib/classes/stores/conference/cloud-membership-store'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import * as Alert from '$lib/components/ui/alert'
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Field from '$lib/components/ui/field'
  import * as InputOTP from '$lib/components/ui/input-otp'
  import { Spinner } from '$lib/components/ui/spinner'
  import ConferenceConfirmDialog from './join/conference-confirm-dialog.svelte'
  import JoinCredentialsDialog from './join/join-credentials-dialog.svelte'

  type JoinStage = 'invite' | 'confirm' | 'credentials'

  let { open = $bindable(false) }: { open: boolean } = $props()
  let stage = $state<JoinStage>('invite')
  let inviteCode = $state('')
  let target = $state<CloudJoinTarget | null>(null)
  let validationError = $state<ProcedureMessage>('')
  let isValidating = $state(false)
  let flowMode = $state<'claim' | 'authenticate'>('claim')
  let membership = $state<CloudMembership | null>(null)
  let storedPassword = $state<string | null>(null)
  let confirmError = $state<ProcedureMessage>('')
  let isRejoining = $state(false)

  function getInviteCode(): string {
    return inviteCode
  }

  function setInviteCode(value: string): void {
    inviteCode = value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '')
    validationError = ''
  }

  function clearInviteCode(): void {
    inviteCode = ''
    validationError = ''
  }

  async function pasteInviteCode(): Promise<void> {
    try {
      const clipboardText = await navigator.clipboard.readText()
      setInviteCode(clipboardText.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12))
    } catch {
      validationError = procedureMessage('procedure_unable_to_read_clipboard_check_system_permissions')
    }
  }

  function resetFlow(): void {
    stage = 'invite'
    inviteCode = ''
    target = null
    validationError = ''
    isValidating = false
    flowMode = 'claim'
    membership = null
    storedPassword = null
    confirmError = ''
    isRejoining = false
  }

  function closeFlow(): void {
    open = false
    resetFlow()
  }

  function handleDialogOpenChange(value: boolean): void {
    if (!value) closeFlow()
  }

  async function handleInviteSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    validationError = ''
    isValidating = true

    try {
      target = await validateCloudInvite(inviteCode)
      membership = getCloudMembershipByInviteCode(target.inviteCode)
      storedPassword = membership ? await getCloudMembershipPassword(membership) : null
      flowMode = target.seatState === 'claimed' ? 'authenticate' : 'claim'
      confirmError = ''
      stage = 'confirm'
    } catch (error) {
      validationError = error instanceof CloudJoinError ? error.message : procedureMessage('procedure_unable_to_verify_invite_code_try_again')
    } finally {
      isValidating = false
    }
  }

  async function handleClaimed(result: CloudClaimResult, password?: string): Promise<void> {
    const { conferenceId, committeeId } = result
    await rememberCloudMembership(result, password)
    cloudSession.setResult(result)
    open = false
    resetFlow()
    void goto(resolve(`/client/${conferenceId}/committee/${committeeId}`))
  }

  async function handleConfirmed(): Promise<void> {
    if (!target || isRejoining) return

    if (target.seatState === 'unclaimed') {
      flowMode = 'claim'
      stage = 'credentials'
      return
    }

    flowMode = 'authenticate'
    if (target.hasPassword && storedPassword === null) {
      stage = 'credentials'
      return
    }

    confirmError = ''
    isRejoining = true
    try {
      const result = await authenticateCloudSeat({
        inviteCode: target.inviteCode,
        password: storedPassword ?? undefined
      })
      await handleClaimed(result, storedPassword ?? undefined)
    } catch (error) {
      if (error instanceof CloudJoinError && (error.status === 401 || error.status === 409)) {
        storedPassword = null
        stage = 'credentials'
      } else {
        confirmError =
          error instanceof CloudJoinError ? error.message : procedureMessage('procedure_unable_to_rejoin_check_your_connection_and_try_again')
      }
    } finally {
      isRejoining = false
    }
  }
</script>

<Dialog.Root open={open && stage === 'invite'} onOpenChange={handleDialogOpenChange}>
  <Dialog.Content class="sm:max-w-2xl" showCloseButton={!isValidating}>
    <form onsubmit={handleInviteSubmit} class="contents">
      <Dialog.Header>
        <Dialog.Title>{t('procedure_join_conference')}</Dialog.Title>
        <Dialog.Description>{t('procedure_enter_your_invite_code_to_find_the_conference_and_seat_you_were_invited_to_join')}</Dialog.Description>
      </Dialog.Header>

      <Field.FieldGroup>
        <Field.Field data-invalid={Boolean(validationError)}>
          <Field.FieldLabel for="conference-invite-code">{t('procedure_invite_code')}</Field.FieldLabel>
          <div class="flex items-center justify-center gap-2">
            <InputOTP.Root
              inputId="conference-invite-code"
              bind:value={getInviteCode, setInviteCode}
              maxlength={12}
              pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
              aria-invalid={Boolean(validationError)}
              disabled={isValidating}
            >
              {#snippet children({ cells })}
                <InputOTP.Group>
                  {#each cells.slice(0, 4) as cell (cell)}
                    <InputOTP.Slot {cell} />
                  {/each}
                </InputOTP.Group>
                <InputOTP.Separator />
                <InputOTP.Group>
                  {#each cells.slice(4, 8) as cell (cell)}
                    <InputOTP.Slot {cell} />
                  {/each}
                </InputOTP.Group>
                <InputOTP.Separator />
                <InputOTP.Group>
                  {#each cells.slice(8, 12) as cell (cell)}
                    <InputOTP.Slot {cell} />
                  {/each}
                </InputOTP.Group>
              {/snippet}
            </InputOTP.Root>

            <Button
              variant="outline"
              size="icon-lg"
              onclick={clearInviteCode}
              aria-label={t('procedure_clear_all')}
              title={t('procedure_clear_all')}
              disabled={isValidating}
            >
              <X data-icon="inline-start" />
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              onclick={pasteInviteCode}
              aria-label={t('procedure_paste_invite_code')}
              title={t('procedure_paste_invite_code')}
              disabled={isValidating}
            >
              <ClipboardPaste data-icon="inline-start" />
            </Button>
          </div>
        </Field.Field>
      </Field.FieldGroup>

      {#if validationError}
        <Alert.Root variant="destructive">
          <CircleAlert />
          <Alert.Title>{t('procedure_unable_to_verify_invite_code')}</Alert.Title>
          <Alert.Description>{renderProcedureMessage(validationError)}</Alert.Description>
        </Alert.Root>
      {/if}

      <Dialog.Footer>
        <Button type="submit" variant="outline" disabled={isValidating || inviteCode.length !== 12}>
          {#if isValidating}
            <Spinner data-icon="inline-start" aria-label={t('procedure_verifying')} />
            {t('procedure_verifying')}
          {:else}
            {t('procedure_join')}
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

{#if target}
  <ConferenceConfirmDialog
    open={open && stage === 'confirm'}
    {target}
    hasStoredCredential={Boolean(storedPassword) || target.hasPassword === false}
    isSubmitting={isRejoining}
    requestError={renderProcedureMessage(confirmError)}
    onBack={() => (stage = 'invite')}
    onConfirm={() => void handleConfirmed()}
    onOpenChange={handleDialogOpenChange}
  />

  <JoinCredentialsDialog
    open={open && stage === 'credentials'}
    {target}
    mode={flowMode}
    onBack={() => {
      confirmError = ''
      stage = 'confirm'
    }}
    onClaimed={(result, password) => void handleClaimed(result, password)}
    onOpenChange={handleDialogOpenChange}
  />
{/if}
