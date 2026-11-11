<script lang="ts">
  import { t } from '$lib/i18n'
  import SettingCard from '../../settings-card.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import * as Select from '$lib/components/ui/select'
  import { globalSettings } from '$lib/classes/stores/app/global-settings.store'
  import {
    currentCommittee,
    setSubstantiveVotingMajority
  } from '$lib/classes/stores/conference/conference-store'
  import CommitteeSnapshots from './committee-snapshots.svelte'
  import { fly } from 'svelte/transition'

  let offsetX = $state($globalSettings.displayOffsetX)
  let offsetY = $state($globalSettings.displayOffsetY)

  $effect(() => {
    offsetX = $globalSettings.displayOffsetX
    offsetY = $globalSettings.displayOffsetY
  })

  function saveIconStyle(style: 'nato' | 'simple') {
    globalSettings.patch({ defaultIconStyle: style })
  }

  function persistOffset() {
    globalSettings.patch({ displayOffsetX: offsetX, displayOffsetY: offsetY })
  }
  function resetOffset() {
    offsetX = 0
    offsetY = 0
    globalSettings.patch({ displayOffsetX: 0, displayOffsetY: 0 })
  }
</script>

<div in:fly={{ y: 8, duration: 320, opacity: 0 }}>
  <ScrollArea>
    <div class="mb-1 text-xl font-bold">{t('settings_committee')}</div>
    <p class="mb-4 text-sm">{t('settings_committee_description')}</p>
    <div class="space-y-3">
      <SettingCard title={t('settings_voting_rules')} description={t('settings_voting_description')}>
        {#if $currentCommittee}
          <Select.Select
            type="single"
            value={$currentCommittee.substantiveVotingMajority}
            onValueChange={(value) => {
              if (value === 'two_thirds' || value === 'simple_majority') {
                setSubstantiveVotingMajority(value)
              }
            }}
          >
            <Select.SelectTrigger aria-label={t('settings_voting_rules')} class="w-48">
              {$currentCommittee.substantiveVotingMajority === 'simple_majority'
                ? t('settings_majority_simple')
                : t('settings_majority_two_thirds')}
            </Select.SelectTrigger>
            <Select.SelectContent>
              <Select.SelectItem value="two_thirds" label={t('settings_majority_two_thirds')} />
              <Select.SelectItem value="simple_majority" label={t('settings_majority_simple')} />
            </Select.SelectContent>
          </Select.Select>
        {:else}
          <p class="text-sm text-muted-foreground">{t('settings_voting_enter_committee')}</p>
        {/if}
      </SettingCard>

      <SettingCard title={t('settings_default_icons')} description={t('settings_default_icons_description')}>
        <div class="flex gap-2">
          <Button
            variant={$globalSettings.defaultIconStyle === 'nato' ? 'default' : 'outline'}
            size="sm"
            onclick={() => saveIconStyle('nato')}>{t('settings_nato')}</Button
          >
          <Button
            variant={$globalSettings.defaultIconStyle === 'simple' ? 'default' : 'outline'}
            size="sm"
            onclick={() => saveIconStyle('simple')}>{t('settings_simple_icons')}</Button
          >
        </div>
      </SettingCard>

      <SettingCard
        title={t('settings_display_position')}
        description={t('settings_display_position_description')}
      >
        <div class="flex items-end gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="display-offset-x" class="text-xs text-muted-foreground">{t('settings_offset_x')}</label>
            <Input
              id="display-offset-x"
              type="number"
              bind:value={offsetX}
              oninput={persistOffset}
              class="w-28"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="display-offset-y" class="text-xs text-muted-foreground">{t('settings_offset_y')}</label>
            <Input
              id="display-offset-y"
              type="number"
              bind:value={offsetY}
              oninput={persistOffset}
              class="w-28"
            />
          </div>
          <Button size="sm" variant="ghost" onclick={resetOffset}>{t('settings_reset')}</Button>
        </div>
      </SettingCard>
    </div>

    <CommitteeSnapshots />
  </ScrollArea>
</div>
