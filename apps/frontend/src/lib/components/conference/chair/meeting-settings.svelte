<script lang="ts">
  import { t } from '$lib/i18n'
  import SettingCard from '$lib/components/settings/settings-card.svelte'
  import {
    currentCommittee,
    setAgendaMode,
    setProcedureRules
  } from '$lib/classes/stores/conference/conference-store'
  import { Switch } from '$lib/components/ui/switch'
  import { defaultProcedureRules } from '$lib/classes/utils/committee/procedure-rules'
  import ProcedureRulesSettings from '$lib/components/settings/pages/common/procedure-rules-settings.svelte'
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
        <SettingCard
          title={t('procedure_agenda_mode')}
          description={t('procedure_agenda_mode_description')}
        >
          <div class="flex justify-end">
            <Switch
              checked={$currentCommittee.agendaMode}
              aria-label={t('procedure_agenda_mode')}
              onCheckedChange={(checked) => setAgendaMode(checked)}
            />
          </div>
        </SettingCard>
      {:else}
        <SettingCard
          title={t('settings_procedure_rules')}
          description={t('settings_procedure_rules_description')}
        >
          <p class="text-sm text-muted-foreground">{t('settings_voting_enter_committee')}</p>
        </SettingCard>
      {/if}
  </div>
</div>
