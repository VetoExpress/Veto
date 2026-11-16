<script lang="ts">
  import { t } from '$lib/i18n'
  import SettingCard from '$lib/components/settings/settings-card.svelte'
  import {
    currentCommittee,
    setProcedureRules
  } from '$lib/classes/stores/conference/conference-store'
  import { defaultProcedureRules } from '$lib/classes/utils/committee/procedure-rules'
  import ProcedureRulesSettings from '$lib/components/settings/pages/common/procedure-rules-settings.svelte'
  import MeetingSnapshots from './meeting-snapshots.svelte'
  import { fly } from 'svelte/transition'
</script>

<div in:fly={{ y: 8, duration: 320, opacity: 0 }}>
  <p class="mb-4 text-sm text-muted-foreground">{t('settings_committee_description')}</p>
  <div class="flex flex-col gap-3">
      {#if $currentCommittee}
        {#key $currentCommittee.id}
          <ProcedureRulesSettings
            initialRules={$currentCommittee.procedureRules ??
              defaultProcedureRules($currentCommittee.substantiveVotingMajority)}
            seats={$currentCommittee.seats}
            onSave={setProcedureRules}
          />
        {/key}
      {:else}
        <SettingCard
          title={t('settings_procedure_rules')}
          description={t('settings_procedure_rules_description')}
        >
          <p class="text-sm text-muted-foreground">{t('settings_voting_enter_committee')}</p>
        </SettingCard>
      {/if}
  </div>

  <MeetingSnapshots />
</div>
