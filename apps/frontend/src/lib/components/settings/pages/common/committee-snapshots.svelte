<script lang="ts">
  import { messageText, type LocalizedMessage } from '$lib/components/ui/localized-message'
  import { t, formatDate, formatNumber } from '$lib/i18n'
  import { onMount } from 'svelte'
  import * as Select from '$lib/components/ui/select'
  import * as Alert from '$lib/components/ui/alert'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import SettingCard from '../../settings-card.svelte'
  import {
    createCommitteeCheckpoint,
    restoreCommitteeCheckpoint,
    currentConferenceId,
    currentCommitteeId,
    currentCommittee,
    restoringCheckpoint
  } from '$lib/classes/stores/conference/conference-store'
  import {
    committeeCheckpoints,
    checkpointError,
    loadCheckpoints,
    type CommitteeCheckpoint
  } from '$lib/classes/services/committee-checkpoints'
  import { PHASE_LABELS } from '$lib/classes/utils/committee/phase'
  import { settingsDialogOpen, showConfirm } from '$lib/classes/stores/app/global-ui-store'

  let selected = $state('')
  let busy = $state(false)
  let error = $state<LocalizedMessage>('')

  const snapshots = $derived(
    $committeeCheckpoints.filter(
      (item) =>
        item.conferenceId === $currentConferenceId && item.committeeId === $currentCommitteeId
    )
  )
  const items = $derived(
    snapshots.map((snapshot) => ({ value: snapshot.id, label: describeSnapshot(snapshot) }))
  )
  const preview = $derived(snapshots.find((item) => item.id === selected))

  onMount(() => {
    loadCheckpoints().catch((caught) => checkpointError.set(String(caught)))
  })

  function describeSnapshot(snapshot: CommitteeCheckpoint): string {
    return `${formatDate(snapshot.createdAt, { dateStyle: 'short', timeStyle: 'short' })} · ${snapshot.label} · ${PHASE_LABELS[snapshot.data.phase]}`
  }

  async function saveSnapshot(): Promise<void> {
    busy = true
    error = ''
    try {
      if (!(await createCommitteeCheckpoint())) error = () => t('settings_snapshot_save_failed')
    } finally {
      busy = false
    }
  }

  function requestRestore(snapshot: CommitteeCheckpoint): void {
    showConfirm(
      t('settings_snapshot_confirm'),
      t('settings_snapshot_confirm_description'),
      () => void restore(snapshot)
    )
  }

  async function restore(snapshot: CommitteeCheckpoint): Promise<void> {
    busy = true
    error = ''
    try {
      await restoreCommitteeCheckpoint(snapshot)
      selected = ''
      settingsDialogOpen.set(false)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : () => t('settings_restore_failed')
    } finally {
      busy = false
    }
  }
</script>

<div class="mt-8">
  <div class="mb-1 text-xl font-bold">{t('settings_snapshots')}</div>
  <p class="mb-4 text-sm text-muted-foreground">
    {t('settings_snapshots_description')}
  </p>

  {#if $currentCommittee}
    <div class="space-y-3">
      <SettingCard
        title={t('settings_snapshot_save')}
        description={t('settings_snapshot_save_description')}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={busy || $restoringCheckpoint}
          onclick={() => void saveSnapshot()}
        >
          {#if busy}<Spinner data-icon="inline-start" />{/if}
          {t('settings_snapshot_save')}
        </Button>
      </SettingCard>

      <SettingCard
        class="md:flex-col md:items-stretch"
        title={t('settings_snapshot_restore')}
        description={t('settings_snapshot_restore_description')}
      >
        <div class="flex flex-col gap-3">
          <Select.Root
            type="single"
            {items}
            value={selected}
            onValueChange={(value) => (selected = value)}
            disabled={busy || $restoringCheckpoint || snapshots.length === 0}
          >
            <Select.Trigger aria-label={t('settings_snapshot_select')} class="w-full max-w-96">
              <Select.Value placeholder={snapshots.length ? t('settings_snapshot_preview') : t('settings_snapshot_empty')} />
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each items as item (item.value)}
                  <Select.Item value={item.value} label={item.label} />
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>

          {#if preview}
            <div class="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
              <p>
                {t('settings_snapshot_summary', { phase: PHASE_LABELS[preview.data.phase], speakers: preview.data.speakerLists?.entries.length ?? 0, votes: preview.data.votingSessions.length })}
              </p>
              {#if preview.data.activeSpeaker}
                <p>
                  {t('settings_snapshot_speaker_remaining', { seconds: formatNumber(Math.max(
                    0,
                    preview.data.activeSpeaker.totalSec - preview.data.activeSpeaker.elapsedSec
                  ), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
                </p>
              {/if}
              {#if preview.data.activeCaucus}
                <p>
                  {t('settings_snapshot_caucus_remaining', { seconds: formatNumber(Math.max(
                    0,
                    preview.data.activeCaucus.totalSec - preview.data.activeCaucus.elapsedSec
                  ), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
                </p>
              {/if}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || $restoringCheckpoint}
                  onclick={() => preview && requestRestore(preview)}
                >
                  {t('settings_snapshot_restore_this')}
                </Button>
              </div>
            </div>
          {/if}

          {#if error || $checkpointError}
            <Alert.Root variant="destructive">
              <Alert.Description>{messageText(error) || $checkpointError}</Alert.Description>
            </Alert.Root>
          {/if}
        </div>
      </SettingCard>
    </div>
  {:else}
    <p class="text-sm text-muted-foreground">{t('settings_snapshot_enter_committee')}</p>
  {/if}
</div>
