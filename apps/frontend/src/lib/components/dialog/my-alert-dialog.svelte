<script lang="ts">
  import { t } from '$lib/i18n'
  import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "$lib/components/ui/alert-dialog";
  import { alertDialogStore, hideAlert } from "$lib/classes/stores/app/global-ui-store";
  import { get } from "svelte/store";

  let state = get(alertDialogStore);
  alertDialogStore.subscribe((value) => (state = value));

  function handleConfirm() {
    state.onConfirm?.();
    hideAlert();
  }
</script>

<AlertDialog bind:open={state.open}>
  <AlertDialogContent class="absolute z-1000 overflow-hidden rounded-lg">
    <AlertDialogHeader>
      <AlertDialogTitle>{state.title}</AlertDialogTitle>
      <AlertDialogDescription>{state.description}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      {#if state.onConfirm}
        <AlertDialogCancel onclick={hideAlert}>{t('components_cancel')}</AlertDialogCancel>
        <AlertDialogAction onclick={handleConfirm}>{t('components_confirm')}</AlertDialogAction>
      {:else}
        <AlertDialogAction onclick={hideAlert}>{t('components_ok')}</AlertDialogAction>
      {/if}
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
