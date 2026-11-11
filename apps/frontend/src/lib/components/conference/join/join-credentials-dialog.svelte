<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t } from '$lib/i18n'
  import { CircleAlert } from '@lucide/svelte'

  import {
    authenticateCloudSeat,
    claimCloudSeat,
    CloudJoinError,
    type CloudClaimResult,
    type CloudJoinTarget
  } from '$lib/classes/clients/cloud-join-client'
  import * as Alert from '$lib/components/ui/alert'
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'

  let {
    open,
    target,
    mode = 'claim',
    onBack,
    onClaimed,
    onOpenChange
  }: {
    open: boolean
    target: CloudJoinTarget
    mode?: 'claim' | 'authenticate'
    onBack: () => void
    onClaimed: (result: CloudClaimResult, password?: string) => void
    onOpenChange: (open: boolean) => void
  } = $props()

  const isClaimMode = $derived(mode === 'claim')

  let displayName = $state('')
  let password = $state('')
  let nameError = $state<ProcedureMessage>('')
  let requestError = $state<ProcedureMessage>('')
  let isSubmitting = $state(false)

  function handleOpenChange(value: boolean): void {
    if (isSubmitting && !value) return
    onOpenChange(value)
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    requestError = ''

    if (isClaimMode) {
      const normalizedName = displayName.trim()
      nameError = normalizedName ? '' : procedureMessage('procedure_enter_your_name_2')
      if (nameError) return
    }

    if ((isClaimMode || target.hasPassword) && !password) {
      requestError = procedureMessage('procedure_enter_joining_password_2')
      return
    }

    isSubmitting = true
    try {
      const result = isClaimMode
        ? await claimCloudSeat({
            inviteCode: target.inviteCode,
            displayName: displayName.trim(),
            password
          })
        : await authenticateCloudSeat({
            inviteCode: target.inviteCode,
            password: password || undefined
          })
      onClaimed(result, password || undefined)
    } catch (error) {
      requestError = error instanceof CloudJoinError ? error.message : procedureMessage('procedure_failed_to_join_conference_try_again')
    } finally {
      isSubmitting = false
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="sm:max-w-md" showCloseButton={!isSubmitting}>
    <form onsubmit={handleSubmit} class="contents">
      <Dialog.Header>
        <Dialog.Title>{isClaimMode ? t('procedure_enter_your_identity') : t('procedure_verify_seat_password')}</Dialog.Title>
        <Dialog.Description>
          {isClaimMode
            ? t('procedure_you_will_join_value_as_value', { value1: target.seatName, value2: target.committeeName })
            : t('procedure_this_seat_has_been_claimed_verify_the_joining_password_for_value', { value1: target.seatName })}
        </Dialog.Description>
      </Dialog.Header>

      <Field.FieldGroup>
        {#if isClaimMode}
          <Field.Field data-invalid={Boolean(nameError)}>
            <Field.FieldLabel for="join-display-name">{t('procedure_name')}</Field.FieldLabel>
            <Input
              id="join-display-name"
              bind:value={displayName}
              maxlength={80}
              autocomplete="name"
              placeholder={t('procedure_enter_your_name')}
              aria-invalid={Boolean(nameError)}
              disabled={isSubmitting}
              required
            />
            {#if nameError}
              <Field.FieldError>{renderProcedureMessage(nameError)}</Field.FieldError>
            {/if}
          </Field.Field>
        {/if}

        <Field.Field>
          <Field.FieldLabel for="join-password">
            {isClaimMode ? t('procedure_password') : t('procedure_joining_password')}
          </Field.FieldLabel>
          <Input
            id="join-password"
            type="password"
            bind:value={password}
            maxlength={128}
            autocomplete={isClaimMode ? 'new-password' : 'current-password'}
            placeholder={isClaimMode ? t('procedure_set_a_password_for_this_seat') : t('procedure_enter_joining_password')}
            disabled={isSubmitting}
            required={isClaimMode || target.hasPassword}
          />
          {#if isClaimMode}
            <Field.FieldDescription>{t('procedure_this_password_is_used_to_sign_in_to_the_seat_again')}</Field.FieldDescription>
          {/if}
        </Field.Field>
      </Field.FieldGroup>

      {#if requestError}
        <Alert.Root variant="destructive">
          <CircleAlert />
          <Alert.Title>{t('procedure_unable_to_join_conference')}</Alert.Title>
          <Alert.Description>{renderProcedureMessage(requestError)}</Alert.Description>
        </Alert.Root>
      {/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={onBack} disabled={isSubmitting}>
          {t('procedure_back')}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting ||
            (isClaimMode && !displayName.trim()) ||
            ((isClaimMode || target.hasPassword) && !password)}
        >
          {#if isSubmitting}
            <Spinner data-icon="inline-start" aria-label={t('procedure_joining')} />
            {t('procedure_joining')}
          {:else}
            {t('procedure_continue_2')}
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
