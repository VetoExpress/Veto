<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import { Check, Cloud, HardDrive, KeyRound, MoreHorizontal, Pencil, Play, Trash2, X } from '@lucide/svelte'
  import type { Conference } from '$lib/classes/types/conference'
  import { currentConferenceId, deleteConference, renameConference } from '$lib/classes/stores/conference/conference-store'
  import { getCloudMembershipsByConferenceId, type CloudMembership } from '$lib/classes/stores/conference/cloud-membership-store'
  import { navigateToConference } from '$lib/classes/utils'
  import { showConfirm } from '$lib/classes/stores/app/global-ui-store'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'

  let { conference, onJoin, onUpdatePassword, onDelete }: {
    conference: Conference
    onJoin?: (conference: Conference) => void
    onUpdatePassword?: (conference: Conference) => void
    onDelete?: (conference: Conference) => void
  } = $props()

  let editing = $state(false)
  let editName = $state('')
  let inputRef = $state<HTMLInputElement | null>(null)
  const isActive = $derived($currentConferenceId === conference.id)
  const memberships = $derived(conference.source === 'cloud' ? getCloudMembershipsByConferenceId(conference.id) : [])

  function seatLabel(membership: CloudMembership): string {
    if (membership.isChair) return membership.chairCommitteeName ? t('settings_chair_committee', { name: membership.chairCommitteeName }) : t('settings_chair')
    const committeePrefix = memberships.length > 1 ? `${membership.committeeName} · ` : ''
    return `${committeePrefix}${membership.seatName} · ${membership.roleName}`
  }
  function handleLoad(): void { if (editing) return; if (conference.source === 'cloud' && onJoin) { onJoin(conference); return }; navigateToConference(conference.id) }
  function handleDelete(event: MouseEvent): void {
    event.stopPropagation()
    const isCloudConference = conference.source === 'cloud'
    showConfirm(isCloudConference ? t('settings_remove_local_confirm') : t('settings_confirm_delete'), isCloudConference ? t('settings_remove_conference_named', { name: conference.name }) : t('settings_delete_conference_named', { name: conference.name }), () => (isCloudConference ? onDelete?.(conference) : deleteConference(conference.id)))
  }
  function startEdit(event: MouseEvent): void { event.stopPropagation(); editName = conference.name; editing = true; setTimeout(() => inputRef?.focus(), 0) }
  function commitEdit(): void { if (editName.trim()) renameConference(conference.id, editName); editing = false }
  function cancelEdit(): void { editName = conference.name; editing = false }
  function handleInputKeydown(event: KeyboardEvent): void { event.stopPropagation(); if (event.key === 'Enter') commitEdit(); else if (event.key === 'Escape') cancelEdit() }
</script>

<div class={['conference-card group', { 'conference-card-active': isActive }]} onclick={handleLoad} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleLoad() } }} role="button" tabindex="0">
  <div class="flex min-w-0 items-center gap-3">
    <div class={['source-icon', { 'source-cloud': conference.source === 'cloud' }]}>{#if conference.source === 'cloud'}<Cloud class="size-[15px]" />{:else}<HardDrive class="size-[15px]" />{/if}</div>
    <div class="min-w-0 flex-1">
      {#if editing}
        <div class="flex items-center gap-1.5"><Input bind:ref={inputRef} bind:value={editName} class="h-7 min-w-0 text-sm font-semibold" onkeydown={handleInputKeydown} /><Button variant="ghost" size="icon-sm" title={t('settings_save')} onclick={(event) => { event.stopPropagation(); commitEdit() }}><Check /></Button><Button variant="ghost" size="icon-sm" title={t('settings_cancel')} onclick={(event) => { event.stopPropagation(); cancelEdit() }}><X /></Button></div>
      {:else}
        <div class="flex min-w-0 items-center gap-2"><h3 class="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{conference.name}</h3>{#if conference.source === 'cloud'}<Badge class="source-badge source-badge-cloud">{t('settings_cloud')}</Badge>{:else}<Badge class="source-badge source-badge-local">{t('settings_local')}</Badge>{/if}</div>
        <p class="mt-1 truncate text-[10px] text-slate-400">{conference.source === 'cloud' ? t('procedure_cloud_workspace') : `${t('procedure_local_workspace')} · ${formatDate(conference.updatedAt)}`}</p>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{#if conference.source !== 'cloud'}<Button variant="ghost" size="icon-sm" title={t('settings_rename')} onclick={startEdit}><Pencil /></Button>{/if}<Button variant="ghost" size="icon-sm" title={conference.source === 'cloud' ? t('settings_rejoin') : t('settings_enter')} onclick={(event) => { event.stopPropagation(); handleLoad() }}><Play /></Button>{#if conference.source === 'cloud'}<Button variant="ghost" size="icon-sm" title={t('settings_password_reenter')} onclick={(event) => { event.stopPropagation(); onUpdatePassword?.(conference) }}><KeyRound /></Button>{/if}{#if conference.source !== 'cloud' || onDelete}<Button variant="ghost" size="icon-sm" class="text-destructive" title={conference.source === 'cloud' ? t('settings_remove_local') : t('settings_delete_conference')} onclick={handleDelete}><Trash2 /></Button>{/if}</div>
    <MoreHorizontal class="size-4 shrink-0 text-slate-400 group-hover:hidden" />
  </div>
  <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400"><span>{t('settings_committee_count', { count: conference.committees.length })}</span><span>{t('settings_seat_count', { count: conference.committees.reduce((count, committee) => count + committee.seats.length, 0) })}</span>{#if memberships.length > 0}<span class="truncate">{memberships.length > 1 ? t('settings_local_identities') : t('settings_current_seat')}: {seatLabel(memberships[0])}</span>{/if}<span class="ml-auto font-semibold text-slate-600 dark:text-slate-300">{conference.source === 'cloud' ? t('settings_rejoin') : t('settings_enter')} <span class="ml-1">→</span></span></div>
</div>

<style>
  .conference-card { cursor: pointer; border: 1px solid #e1e6ee; border-radius: .85rem; background: #fff; padding: 1rem 1.05rem; transition: border-color .15s, box-shadow .15s, transform .15s; }
  .conference-card:hover { border-color: #b9c3d2; box-shadow: 0 6px 16px #1720330d; transform: translateY(-1px); }
  .conference-card-active { border-color: #c9d0ff; box-shadow: 0 4px 12px #6473d41f; }
  :global(.dark) .conference-card { border-color: #293548; background: #1b2537; } :global(.dark) .conference-card-active { border-color: #6671d4; }
  .source-icon { display: flex; height: 30px; width: 30px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: .55rem; background: #eef1f5; color: #607087; } .source-icon.source-cloud { background: #e8f7f3; color: #279a87; }
  :global(.source-badge) { border: 0; padding: .2rem .4rem; font-size: 9px; font-weight: 600; } :global(.source-badge-local) { background: #eef1f5; color: #607087; } :global(.source-badge-cloud) { background: #e8f7f3; color: #279a87; }
</style>
