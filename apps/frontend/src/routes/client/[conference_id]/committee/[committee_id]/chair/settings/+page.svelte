<script lang="ts">
  import { t } from '$lib/i18n'
  import { page } from '$app/state'
  import { resolve } from '$app/paths'
  import { Settings } from '@lucide/svelte'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'
  import MeetingSettings from '$lib/components/conference/chair/meeting-settings.svelte'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { currentCommittee } from '$lib/classes/stores/conference/conference-store'
  import { VETO_NAME } from '$lib/classes/const'

  const conferenceId = $derived(page.params.conference_id ?? '')
  const committeeId = $derived(page.params.committee_id ?? '')
  const conf = $derived($currentCommittee)
</script>

<svelte:head>
  <title>{t('procedure_meeting_settings')} · {VETO_NAME}</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
  <PageTopBar
    icon={Settings}
    title={t('procedure_meeting_settings')}
    subtitle={conf?.name}
    backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
    backLabel={t('procedure_back_to_meeting')}
  />

  <ScrollArea class="min-h-0 flex-1">
    <div class="mx-auto max-w-4xl px-6 py-6">
      <MeetingSettings />
    </div>
  </ScrollArea>
</div>
