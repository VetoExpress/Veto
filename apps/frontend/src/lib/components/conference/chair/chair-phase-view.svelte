<script lang="ts">
  import { t } from '$lib/i18n'
  import { AlertTriangle, Gavel, Play, Users } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import PlaceholderPage from '$lib/components/conference/layout/placeholder-page.svelte'
  import CaucusSetupView from '$lib/components/conference/caucus/caucus-setup-view.svelte'
  import GeneralDebateView from '$lib/components/conference/speakers/general-debate-view.svelte'
  import ModeratedCaucusView from '$lib/components/conference/speakers/moderated-caucus-view.svelte'
  import CaucusCountdownView from '$lib/components/conference/speakers/caucus-countdown-view.svelte'
  import VotingView from '$lib/components/conference/voting/voting-view.svelte'
  import type { ChairScreen } from '$lib/classes/utils/committee/chair-presentation'

  let {
    screen,
    onStartRollCall
  }: {
    screen: ChairScreen
    onStartRollCall: () => void
  } = $props()
</script>

<div class="flex min-h-0 flex-1 overflow-hidden p-6">
  {#if screen.kind === 'preamble'}
    <PlaceholderPage title={t('procedure_preparation')} subtitle={t('procedure_all_participants_are_ready_start_roll_call')} icon={Users}>
      <Button size="lg" class="gap-2 bg-indigo-600 hover:bg-indigo-700" onclick={onStartRollCall}>
        <Play size={18} />
        {t('procedure_start_roll_call')}
      </Button>
    </PlaceholderPage>
  {:else if screen.kind === 'roll_call'}
    <PlaceholderPage title={t('procedure_roll_call_in_progress')} subtitle={t('procedure_roll_call_is_open_on_a_separate_page')} icon={Users}>
      <Button size="lg" class="gap-2 bg-indigo-600 hover:bg-indigo-700" onclick={onStartRollCall}>
        <Play size={18} />
        {t('procedure_open_roll_call')}
      </Button>
    </PlaceholderPage>
  {:else if screen.kind === 'pending_speakers_list'}
    <PlaceholderPage
      title={t('procedure_waiting_to_open_the_speakers_list')}
      subtitle={t('procedure_roll_call_is_complete_a_delegate_must_move_to_open_the_speakers_list_to_begin_general_')}
      icon={Users}
    />
  {:else if screen.kind === 'general_debate'}
    <ScrollArea class="flex-1">
      <GeneralDebateView />
    </ScrollArea>
  {:else if screen.kind === 'caucus_setup'}
    <ScrollArea class="flex-1">
      <CaucusSetupView />
    </ScrollArea>
  {:else if screen.kind === 'moderated_caucus'}
    <ScrollArea class="flex-1">
      <ModeratedCaucusView />
    </ScrollArea>
  {:else if screen.kind === 'caucus_countdown'}
    <ScrollArea class="flex-1">
      <CaucusCountdownView mode={screen.mode} />
    </ScrollArea>
  {:else if screen.kind === 'voting'}
    <ScrollArea class="flex-1">
      <VotingView />
    </ScrollArea>
  {:else if screen.kind === 'suspended'}
    <PlaceholderPage title={t('procedure_meeting_suspended')} subtitle={t('procedure_select_resume_meeting_to_continue')} icon={Gavel} />
  {:else if screen.kind === 'closed'}
    <PlaceholderPage title={t('procedure_meeting_closed')} subtitle={t('procedure_select_resume_meeting_to_reset_the_procedure')} icon={Gavel} />
  {:else}
    <PlaceholderPage title={t('procedure_invalid_meeting_state')} subtitle={screen.message} icon={AlertTriangle} />
  {/if}
</div>
