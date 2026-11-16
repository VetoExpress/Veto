<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte'
  import { resolve } from '$app/paths'
  import { t } from '$lib/i18n'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import AppPage from '$lib/components/page-shell/app-page.svelte'
  import AppPageHeader from '$lib/components/page-shell/app-page-header.svelte'
  import { Button } from '$lib/components/ui/button'
  import CreateConferenceWizard from '$lib/components/conference/create/create-conference-wizard.svelte'

  const description = $derived(
    wizard.mode === 'conference'
      ? t('procedure_click_next_to_open_the_veto_platform')
      : wizard.mode === 'singleton'
        ? t('procedure_configure_one_independently_chaired_meeting_and_its_seats')
        : t('procedure_configure_the_conference_committees_roles_capabilities_and_seats')
  )
</script>

<svelte:head>
  <title>{t('procedure_create_conference')} · Veto</title>
</svelte:head>

<AppPage>
  <div class="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
    <AppPageHeader title={t('procedure_create_conference')} {description}>
      <Button variant="outline" href={resolve('/conference')}>
        <ArrowLeft data-icon="inline-start" />
        {t('procedure_workspace')}
      </Button>
    </AppPageHeader>

    <CreateConferenceWizard />
  </div>
</AppPage>
