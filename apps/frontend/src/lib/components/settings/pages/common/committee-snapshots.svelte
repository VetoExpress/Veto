<script lang="ts">
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
  let error = $state('')

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
    return `${new Date(snapshot.createdAt).toLocaleString('zh-CN')} · ${snapshot.label} · ${PHASE_LABELS[snapshot.data.phase]}`
  }

  async function saveSnapshot(): Promise<void> {
    busy = true
    error = ''
    try {
      if (!(await createCommitteeCheckpoint())) error = '快照未保存，请检查本地存储后重试'
    } finally {
      busy = false
    }
  }

  function requestRestore(snapshot: CommitteeCheckpoint): void {
    showConfirm(
      '恢复这份快照？',
      '恢复将替换当前会场的本地议事记录，并暂停计时。恢复前会自动备份当前记录。',
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
      error = caught instanceof Error ? caught.message : '恢复失败'
    } finally {
      busy = false
    }
  }
</script>

<div class="mt-8">
  <div class="mb-1 text-xl font-bold">本地会议快照</div>
  <p class="mb-4 text-sm text-muted-foreground">
    阶段切换时自动留存快照；每个会场保留最近 20 份，全机最多 100
    份。快照只恢复本地议事记录，恢复后计时保持暂停。
  </p>

  {#if $currentCommittee}
    <div class="space-y-3">
      <SettingCard
        title="保存当前快照"
        description="将当前会场的发言名单、磋商与表决进度保存为一份本地快照。"
      >
        <Button
          variant="outline"
          size="sm"
          disabled={busy || $restoringCheckpoint}
          onclick={() => void saveSnapshot()}
        >
          {#if busy}<Spinner data-icon="inline-start" />{/if}
          保存当前快照
        </Button>
      </SettingCard>

      <SettingCard
        class="md:flex-col md:items-stretch"
        title="恢复快照"
        description="选择一份快照预览内容；恢复会替换当前会场的本地议事记录，并自动备份当前记录。"
      >
        <div class="flex flex-col gap-3">
          <Select.Root
            type="single"
            {items}
            value={selected}
            onValueChange={(value) => (selected = value)}
            disabled={busy || $restoringCheckpoint || snapshots.length === 0}
          >
            <Select.Trigger aria-label="选择会议快照" class="w-full max-w-96">
              <Select.Value placeholder={snapshots.length ? '选择快照预览' : '暂无快照'} />
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
                阶段：{PHASE_LABELS[preview.data.phase]} · 发言队列：{preview.data.speakerLists
                  ?.entries.length ?? 0} 人 · 表决记录：{preview.data.votingSessions.length} 次
              </p>
              {#if preview.data.activeSpeaker}
                <p>
                  当前发言剩余：{Math.max(
                    0,
                    preview.data.activeSpeaker.totalSec - preview.data.activeSpeaker.elapsedSec
                  ).toFixed(1)}
                  秒
                </p>
              {/if}
              {#if preview.data.activeCaucus}
                <p>
                  磋商剩余：{Math.max(
                    0,
                    preview.data.activeCaucus.totalSec - preview.data.activeCaucus.elapsedSec
                  ).toFixed(1)}
                  秒
                </p>
              {/if}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || $restoringCheckpoint}
                  onclick={() => preview && requestRestore(preview)}
                >
                  恢复这份快照
                </Button>
              </div>
            </div>
          {/if}

          {#if error || $checkpointError}
            <Alert.Root variant="destructive">
              <Alert.Description>{error || $checkpointError}</Alert.Description>
            </Alert.Root>
          {/if}
        </div>
      </SettingCard>
    </div>
  {:else}
    <p class="text-sm text-muted-foreground">请先进入一个委员会，再管理本地会议快照。</p>
  {/if}
</div>
