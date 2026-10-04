<script lang="ts">
  import { onMount } from 'svelte'
  import { conferenceSaveStatus, retryConferenceStorage, createCommitteeCheckpoint, restoreCommitteeCheckpoint, currentConferenceId, currentCommitteeId, restoringCheckpoint } from '$lib/classes/stores/conference/conference-store'
  import { committeeCheckpoints, checkpointError, loadCheckpoints, type CommitteeCheckpoint } from '$lib/classes/services/committee-checkpoints'
  import { PHASE_LABELS } from '$lib/classes/utils/committee/phase'
  let selected = $state('')
  let busy = $state(false)
  let error = $state('')
  const snapshots = $derived($committeeCheckpoints.filter((item) => item.conferenceId === $currentConferenceId && item.committeeId === $currentCommitteeId))
  const preview = $derived(snapshots.find((item) => item.id === selected))
  onMount(() => { loadCheckpoints().catch((caught) => { checkpointError.set(String(caught)) }) })
  async function saveSnapshot() {
    busy = true; error = ''
    try { if (!await createCommitteeCheckpoint()) error = '快照未保存，请检查本地存储后重试' }
    finally { busy = false }
  }
  async function restore(snapshot: CommitteeCheckpoint) {
    if (!window.confirm('恢复将替换当前会场的本地议事记录，并暂停计时。恢复前会自动备份当前记录，确定继续吗？')) return
    busy = true; error = ''
    try { await restoreCommitteeCheckpoint(snapshot); selected = '' }
    catch (caught) { error = caught instanceof Error ? caught.message : '恢复失败' }
    finally { busy = false }
  }
</script>

<div class="mx-4 my-2 rounded-lg border bg-background p-3 text-sm">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p role="status" aria-live="polite">
      {#if $conferenceSaveStatus.state === 'error'}保存异常：{$conferenceSaveStatus.error}
      {:else if $conferenceSaveStatus.state === 'loading'}正在加载会议记录…
      {:else if $conferenceSaveStatus.state === 'saving'}正在保存…
      {:else if $conferenceSaveStatus.state === 'pending'}有更改待保存
      {:else}{$conferenceSaveStatus.savedAt ? `已保存于 ${new Date($conferenceSaveStatus.savedAt).toLocaleTimeString('zh-CN')}` : '已加载本地会议记录'}{/if}
    </p>
    <button class="rounded-md border px-3 py-1.5 hover:bg-muted" disabled={busy || $restoringCheckpoint || $conferenceSaveStatus.state === 'saving'} onclick={() => void retryConferenceStorage()}>{$conferenceSaveStatus.state === 'error' ? '重试保存 / 加载' : '立即保存'}</button>
  </div>
  <details class="mt-2">
    <summary class="cursor-pointer text-muted-foreground">本地会议快照与恢复</summary>
    <p class="my-3 text-xs text-muted-foreground">阶段切换时自动留存快照；每个会场保留最近 20 份，全机最多 100 份。快照只恢复本地议事记录，计时恢复后保持暂停。</p>
    <div class="flex flex-wrap gap-2">
      <button class="rounded-md border px-3 py-1.5 hover:bg-muted" disabled={busy} onclick={saveSnapshot}>保存当前快照</button>
      <select class="min-w-0 rounded-md border bg-background p-2" aria-label="选择会议快照" bind:value={selected} disabled={busy}>
        <option value="">{snapshots.length ? '选择快照预览' : '暂无快照'}</option>
        {#each snapshots as snapshot (snapshot.id)}<option value={snapshot.id}>{new Date(snapshot.createdAt).toLocaleString('zh-CN')} · {snapshot.label} · {PHASE_LABELS[snapshot.data.phase]}</option>{/each}
      </select>
    </div>
    {#if preview}
      <div class="mt-3 space-y-2 rounded-md bg-muted p-3">
        <p>阶段：{PHASE_LABELS[preview.data.phase]} · 发言队列：{preview.data.speakerLists?.entries.length ?? 0} 人 · 表决记录：{preview.data.votingSessions.length} 次</p>
        {#if preview.data.activeSpeaker}<p>当前发言剩余：{Math.max(0, preview.data.activeSpeaker.totalSec - preview.data.activeSpeaker.elapsedSec).toFixed(1)} 秒</p>{/if}
        {#if preview.data.activeCaucus}<p>磋商剩余：{Math.max(0, preview.data.activeCaucus.totalSec - preview.data.activeCaucus.elapsedSec).toFixed(1)} 秒</p>{/if}
        <button class="rounded-md border px-3 py-1.5 hover:bg-background" disabled={busy} onclick={() => preview && restore(preview)}>恢复这份快照</button>
      </div>
    {/if}
  </details>
  {#if error || $checkpointError}<p role="alert" class="mt-2 text-destructive">{error || $checkpointError}</p>{/if}
</div>
