<script lang="ts">
  import { t } from '$lib/i18n'
  import { PanelLeft } from '@lucide/svelte'
  import { page } from '$app/stores'

  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import { conferences } from '$lib/classes/stores/conference/conference-store'
  import * as Empty from '$lib/components/ui/empty'

  const conferenceId = $derived($page.params.conference_id ?? '')
  const committeeId = $derived($page.params.committee_id ?? '')
  const conference = $derived(
    $conferences.find((candidate) => candidate.id === conferenceId) ?? null
  )
  const committee = $derived(
    conference?.committees.find((candidate) => candidate.id === committeeId) ?? null
  )
  const cloudProjection = $derived(
    cloudSession.chairProjection?.conference.id === conferenceId &&
      cloudSession.chairProjection?.committee.id === committeeId
      ? cloudSession.chairProjection
      : null
  )
  const cloudResult = $derived(
    cloudSession.session?.result.conferenceId === conferenceId &&
      cloudSession.session.result.committeeId === committeeId
      ? cloudSession.session.result
      : null
  )

  const conferenceName = $derived(
    cloudProjection?.conference.name ?? conference?.name ?? t('procedure_current_conference')
  )
  const committeeName = $derived(cloudProjection?.committee.name ?? committee?.name ?? t('procedure_current_committee'))
  const organizer = $derived(
    cloudProjection?.conference.organizer ?? conference?.organizer ?? t('procedure_not_provided')
  )
  const seatName = $derived(cloudResult ? cloudResult.seatShortName || cloudResult.seatName : null)
  const participantCount = $derived(
    cloudProjection
      ? cloudProjection.seats.filter((seat) => seat.id !== cloudProjection.chairSeat.id).length
      : (committee?.participantSeats.length ?? 0)
  )
</script>

<div class="flex h-full min-h-0 items-center justify-center p-6">
  <Empty.Root class="max-w-2xl border bg-card/45 py-10 shadow-sm">
    <Empty.Header>
      <Empty.Media variant="icon">
        <PanelLeft class="size-5" />
      </Empty.Media>
      <Empty.Title>{t('procedure_start_your_conference_from_the_sidebar')}</Empty.Title>
      <Empty.Description>{t('procedure_choose_an_available_feature_on_the_left_to_view_content_or_enter_the_chair_workspace')}</Empty.Description>
    </Empty.Header>

    <Empty.Content class="max-w-xl">
      <dl class="grid w-full gap-3 text-left sm:grid-cols-2">
        <div class="rounded-lg border bg-background/60 p-3">
          <dt class="text-xs text-muted-foreground">{t('procedure_conference')}</dt>
          <dd class="mt-1 truncate text-sm font-medium text-foreground">{conferenceName}</dd>
        </div>
        <div class="rounded-lg border bg-background/60 p-3">
          <dt class="text-xs text-muted-foreground">{t('procedure_committee')}</dt>
          <dd class="mt-1 truncate text-sm font-medium text-foreground">{committeeName}</dd>
        </div>
        <div class="rounded-lg border bg-background/60 p-3">
          <dt class="text-xs text-muted-foreground">{t('procedure_organizer')}</dt>
          <dd class="mt-1 truncate text-sm font-medium text-foreground">{organizer}</dd>
        </div>
        <div class="rounded-lg border bg-background/60 p-3">
          {#if seatName && cloudResult}
            <dt class="text-xs text-muted-foreground">{t('procedure_current_identity')}</dt>
            <dd class="mt-1 truncate text-sm font-medium text-foreground">
              {seatName} · {cloudResult.roleName}
            </dd>
          {:else}
            <dt class="text-xs text-muted-foreground">{t('procedure_participants')}</dt>
            <dd class="mt-1 text-sm font-medium text-foreground">{t('procedure_participant_count', { value1: participantCount })}</dd>
          {/if}
        </div>
      </dl>
    </Empty.Content>
  </Empty.Root>
</div>
