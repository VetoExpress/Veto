<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t } from '$lib/i18n'
  import { CircleAlert } from '@lucide/svelte'

  import { CloudJoinError } from '$lib/classes/clients/cloud-join-client'
  import {
    getCloudMembershipPassword,
    updateCloudMembershipPassword,
    type CloudMembership
  } from '$lib/classes/stores/conference/cloud-membership-store'
  import * as Alert from '$lib/components/ui/alert'
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'

  let {
    open,
    membership,
    onOpenChange
  }: {
    open: boolean
    membership: CloudMembership | null
    onOpenChange: (open: boolean) => void
  } = $props()

  let currentPassword = $state('')
  let nextPassword = $state('')
  let confirmPassword = $state('')
  let requestError = $state<ProcedureMessage>('')
  let isSubmitting = $state(false)

  const passwordsDoNotMatch = $derived(
    confirmPassword.length > 0 && nextPassword !== confirmPassword
  )

  function resetForm(): void {
    currentPassword = ''
    nextPassword = ''
    confirmPassword = ''
    requestError = ''
    isSubmitting = false
  }

  $effect(() => {
    if (!open || !membership) {
      resetForm()
      return
    }

    let active = true
    getCloudMembershipPassword(membership).then((password) => {
      if (active) currentPassword = password ?? ''
    })

    return () => {
      active = false
    }
  })

  function handleOpenChange(value: boolean): void {
    if (isSubmitting && !value) return
    onOpenChange(value)
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (!membership || !nextPassword || passwordsDoNotMatch || isSubmitting) return

    requestError = ''
    isSubmitting = true
    try {
      await updateCloudMembershipPassword(membership, nextPassword)
      onOpenChange(false)
    } catch (error) {
      requestError = error instanceof CloudJoinError ? error.message : procedureMessage('procedure_unable_to_save_joining_password_try_again')
    } finally {
      isSubmitting = false
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="sm:max-w-md" showCloseButton={!isSubmitting}>
    <form onsubmit={handleSubmit} class="contents">
      <Dialog.Header>
        <Dialog.Title>{t('procedure_update_saved_joining_password')}</Dialog.Title>
        <Dialog.Description>
          {t('procedure_this_changes_the_password_saved_on_this_device_only_the_cloud_seat_password_remains_th')}
        </Dialog.Description>
      </Dialog.Header>

      <Field.FieldGroup>
        <Field.Field>
          <Field.FieldLabel for="cloud-current-password">{t('procedure_current_password')}</Field.FieldLabel>
          <Input
            id="cloud-current-password"
            bind:value={currentPassword}
            type="text"
            readonly
            placeholder={t('procedure_no_password_saved_on_this_device')}
          />
        </Field.Field>

        <Field.Field data-invalid={!nextPassword}>
          <Field.FieldLabel for="cloud-next-password">{t('procedure_new_joining_password')}</Field.FieldLabel>
          <Input
            id="cloud-next-password"
            bind:value={nextPassword}
            type="password"
            maxlength={128}
            autocomplete="new-password"
            placeholder={t('procedure_enter_a_new_joining_password')}
            aria-invalid={!nextPassword}
            disabled={isSubmitting}
            required
          />
          {#if !nextPassword}
            <Field.FieldError>{t('procedure_enter_a_new_joining_password_2')}</Field.FieldError>
          {/if}
        </Field.Field>

        <Field.Field data-invalid={passwordsDoNotMatch}>
          <Field.FieldLabel for="cloud-confirm-password">{t('procedure_confirm_new_password')}</Field.FieldLabel>
          <Input
            id="cloud-confirm-password"
            bind:value={confirmPassword}
            type="password"
            maxlength={128}
            autocomplete="new-password"
            placeholder={t('procedure_enter_the_new_joining_password_again')}
            aria-invalid={passwordsDoNotMatch}
            disabled={isSubmitting}
            required
          />
          {#if passwordsDoNotMatch}
            <Field.FieldError>{t('procedure_passwords_do_not_match')}</Field.FieldError>
          {/if}
        </Field.Field>
      </Field.FieldGroup>

      {#if requestError}
        <Alert.Root variant="destructive">
          <CircleAlert />
          <Alert.Title>{t('procedure_unable_to_save_password')}</Alert.Title>
          <Alert.Description>{renderProcedureMessage(requestError)}</Alert.Description>
        </Alert.Root>
      {/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => onOpenChange(false)}>{t('procedure_cancel')}</Button>
        <Button type="submit" disabled={isSubmitting || !nextPassword || passwordsDoNotMatch}>
          {#if isSubmitting}
            <Spinner data-icon="inline-start" aria-label={t('procedure_saving_2')} />
            {t('procedure_saving_2')}
          {:else}
            {t('procedure_save_password')}
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
