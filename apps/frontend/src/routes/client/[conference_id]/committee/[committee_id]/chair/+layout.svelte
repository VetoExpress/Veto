<script lang="ts">
  import { page } from '$app/state'
  import { beforeNavigate } from '$app/navigation'
  import MeetingRecovery from '$lib/components/conference/chair/meeting-recovery.svelte'
  import {
    currentCommittee,
    loadConference,
    motionDraft,
    pointDraft,
    saveConferencesNow,
    restoringCheckpoint
  } from '$lib/classes/stores/conference/conference-store'
  import {
    chairDisplayExtra,
    resetChairDisplayExtra
  } from '$lib/classes/stores/conference/chair-display-store'
  import { destroyAllTimers } from '$lib/classes/services/engine/conference-engine'
  import {
    buildDisplayData,
    getDisplayBridge
  } from '$lib/classes/clients/conference-display-client'

  let { children } = $props()
  beforeNavigate((navigation) => { if ($restoringCheckpoint) navigation.cancel() })

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  $effect(() => {
    const activeConferenceId = conferenceId
    const activeCommitteeId = committeeId
    if (activeConferenceId) {
      void loadConference(activeConferenceId, activeCommitteeId ?? undefined)
    }

    return () => {
      resetChairDisplayExtra()
      void saveConferencesNow()
      destroyAllTimers()
    }
  })

  $effect(() => {
    const committee = $currentCommittee
    if (!committee || committee.id !== committeeId) return

    getDisplayBridge().sendUpdate(
      buildDisplayData(committee, {
        ...$chairDisplayExtra,
        motionDraft: $motionDraft ?? undefined,
        pointDraft: $pointDraft ?? undefined
      })
    )
  })
</script>

<MeetingRecovery />
<div class="min-h-0 flex-1" inert={$restoringCheckpoint}>
  {@render children()}
</div>
