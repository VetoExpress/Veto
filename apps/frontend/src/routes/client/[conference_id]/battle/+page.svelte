<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/stores'
  import { ArrowLeft } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import WindowControls from '$lib/components/app-sidebar/window-controls.svelte'
  import BattleWorkspace from '$lib/components/conference/battle-workspace.svelte'
  import { conferences } from '$lib/classes/stores/conference/conference-store'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import { VETO_NAME } from '$lib/classes/const'

  const conferenceId = $derived($page.params.conference_id ?? '')
  const session = $derived(
    cloudSession.session?.result.conferenceId === conferenceId ? cloudSession.session.result : null
  )
  const conferenceName = $derived(
    session?.conferenceName ?? $conferences.find((conference) => conference.id === conferenceId)?.name ?? ''
  )

  function goBack(): void {
    if (session) {
      goto(resolve('/client/[conference_id]/committee/[committee_id]', {
        conference_id: conferenceId, committee_id: session.identity.committeeId
      }))
    } else {
      goto(resolve('/conference'))
    }
  }
</script>

<svelte:head><title>军事推演 · {conferenceName || VETO_NAME}</title></svelte:head>

<div class="flex h-svh flex-col overflow-hidden">
  <header class="flex h-9 shrink-0 items-center gap-2 pl-2">
    <Button variant="ghost" size="icon-sm" onclick={goBack} title="返回会场" class="no-drag">
      <ArrowLeft />
    </Button>
    <span class="truncate text-xs font-medium">{conferenceName} · 军事推演</span>
    <div class="drag-region h-full min-w-0 flex-1"></div>
    <WindowControls />
  </header>
  {#key conferenceId}
    <BattleWorkspace {conferenceId} {conferenceName} onback={goBack} />
  {/key}
</div>

<style>
  .drag-region { -webkit-app-region: drag; }
  :global(.no-drag) { -webkit-app-region: no-drag; }
</style>
