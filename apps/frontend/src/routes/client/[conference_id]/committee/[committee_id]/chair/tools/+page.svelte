<script lang="ts">
  import { t } from '$lib/i18n'
  import { page } from '$app/state'
  import { resolve } from '$app/paths'
  import { Wrench } from '@lucide/svelte'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'

  const conferenceId = $derived(page.params.conference_id ?? '')
  const committeeId = $derived(page.params.committee_id ?? '')
</script>

<div class="flex h-full flex-col bg-background">
  <PageTopBar
    icon={Wrench}
    title={t('procedure_tools')}
    backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
  />
</div>
