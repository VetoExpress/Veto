<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import {
    Check,
    Cloud,
    HardDrive,
    KeyRound,
    Pencil,
    Play,
    Trash2,
    X
  } from '@lucide/svelte'
  import type { Conference } from '$lib/classes/types/conference'
  import {
    currentConferenceId,
    deleteConference,
    renameConference
  } from '$lib/classes/stores/conference/conference-store'
  import {
    getCloudMembershipsByConferenceId,
    type CloudMembership
  } from '$lib/classes/stores/conference/cloud-membership-store'
  import { navigateToConference } from '$lib/classes/utils'
  import { showConfirm } from '$lib/classes/stores/app/global-ui-store'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'

  let {
    conference,
    onJoin,
    onUpdatePassword,
    onDelete
  }: {
    conference: Conference
    onJoin?: (conference: Conference) => void
    onUpdatePassword?: (conference: Conference) => void
    onDelete?: (conference: Conference) => void
  } = $props()

  let editing = $state(false)
  let editName = $state('')
  let inputRef = $state<HTMLInputElement | null>(null)
  const isActive = $derived($currentConferenceId === conference.id)
  const memberships = $derived(
    conference.source === 'cloud' ? getCloudMembershipsByConferenceId(conference.id) : []
  )

  function seatLabel(membership: CloudMembership): string {
    if (membership.isChair)
      return membership.chairCommitteeName
        ? t('settings_chair_committee', { name: membership.chairCommitteeName })
        : t('settings_chair')
    const committeePrefix = memberships.length > 1 ? `${membership.committeeName} · ` : ''
    return `${committeePrefix}${membership.seatName} · ${membership.roleName}`
  }
  function handleLoad(): void {
    if (editing) return
    if (conference.source === 'cloud' && onJoin) {
      onJoin(conference)
      return
    }
    navigateToConference(conference.id)
  }
  function handleDelete(event: MouseEvent): void {
    event.stopPropagation()
    const isCloudConference = conference.source === 'cloud'
    showConfirm(
      isCloudConference ? t('settings_remove_local_confirm') : t('settings_confirm_delete'),
      isCloudConference
        ? t('settings_remove_conference_named', { name: conference.name })
        : t('settings_delete_conference_named', { name: conference.name }),
      () => (isCloudConference ? onDelete?.(conference) : deleteConference(conference.id))
    )
  }
  function startEdit(event: MouseEvent): void {
    event.stopPropagation()
    editName = conference.name
    editing = true
    setTimeout(() => inputRef?.focus(), 0)
  }
  function commitEdit(): void {
    if (editName.trim()) renameConference(conference.id, editName)
    editing = false
  }
  function cancelEdit(): void {
    editName = conference.name
    editing = false
  }
  function handleInputKeydown(event: KeyboardEvent): void {
    event.stopPropagation()
    if (event.key === 'Enter') commitEdit()
    else if (event.key === 'Escape') cancelEdit()
  }
</script>

<div
  class={['conference-card group', { 'conference-card-active': isActive }]}
  onclick={handleLoad}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleLoad()
    }
  }}
  role="button"
  tabindex="0"
>
  <div class="flex min-w-0 items-center gap-3">
    <div class={['source-icon', { 'source-cloud': conference.source === 'cloud' }]}>
      {#if conference.source === 'cloud'}<Cloud class="size-[15px]" />{:else}<HardDrive
          class="size-[15px]"
        />{/if}
    </div>
    <div class="min-w-0 flex-1">
      {#if editing}
        <div class="flex items-center gap-1.5">
          <Input
            bind:ref={inputRef}
            bind:value={editName}
            class="h-7 min-w-0 text-sm font-semibold"
            onkeydown={handleInputKeydown}
          /><Button
            variant="ghost"
            size="icon-sm"
            title={t('settings_save')}
            onclick={(event) => {
              event.stopPropagation()
              commitEdit()
            }}
          >
            <Check />
          </Button><Button
            variant="ghost"
            size="icon-sm"
            title={t('settings_cancel')}
            onclick={(event) => {
              event.stopPropagation()
              cancelEdit()
            }}
          >
            <X />
          </Button>
        </div>
      {:else}
        <div class="flex min-w-0 items-center gap-2">
          <h3 class="truncate text-[15px] font-semibold text-foreground">
            {conference.name}
          </h3>
          {#if conference.source === 'cloud'}<Badge class="source-badge source-badge-cloud">
              {t('settings_cloud')}
            </Badge>{:else}<Badge class="source-badge source-badge-local">
              {t('settings_local')}
            </Badge>{/if}
        </div>
        <p class="mt-1 truncate text-xs text-muted-foreground">
          {conference.source === 'cloud'
            ? t('procedure_cloud_workspace')
            : `${t('procedure_local_workspace')} · ${formatDate(conference.updatedAt)}`}
        </p>
      {/if}
    </div>
    <div
      class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
    >
      {#if conference.source !== 'cloud'}<Button
          variant="ghost"
          size="icon-sm"
          title={t('settings_rename')}
          onclick={startEdit}
        >
          <Pencil />
        </Button>{/if}<Button
        variant="ghost"
        size="icon-sm"
        title={conference.source === 'cloud' ? t('settings_rejoin') : t('settings_enter')}
        onclick={(event) => {
          event.stopPropagation()
          handleLoad()
        }}
      >
        <Play />
      </Button>{#if conference.source === 'cloud'}<Button
          variant="ghost"
          size="icon-sm"
          title={t('settings_password_reenter')}
          onclick={(event) => {
            event.stopPropagation()
            onUpdatePassword?.(conference)
          }}
        >
          <KeyRound />
        </Button>{/if}{#if conference.source !== 'cloud' || onDelete}<Button
          variant="ghost"
          size="icon-sm"
          class="text-destructive"
          title={conference.source === 'cloud'
            ? t('settings_remove_local')
            : t('settings_delete_conference')}
          onclick={handleDelete}
        >
          <Trash2 />
        </Button>{/if}
    </div>
  </div>
  <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
    <span>{t('settings_committee_count', { count: conference.committees.length })}</span>
    <span>
      {t('settings_seat_count', {
        count: conference.committees.reduce((count, committee) => count + committee.seats.length, 0)
      })}
    </span>
    {#if memberships.length > 0}<span class="truncate">
        {memberships.length > 1 ? t('settings_local_identities') : t('settings_current_seat')}: {seatLabel(
          memberships[0]
        )}
      </span>{/if}
      <span class="ml-auto text-xs font-semibold text-foreground">
      {conference.source === 'cloud' ? t('settings_rejoin') : t('settings_enter')}
      <span class="ml-1">→</span>
    </span>
  </div>
</div>

<style>
  .conference-card {
    cursor: pointer;
    border: 1px solid var(--border);
    border-radius: 0.85rem;
    background: var(--card);
    color: var(--card-foreground);
    padding: 1rem;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }
  .conference-card:hover {
    border-color: var(--ring);
    background: var(--muted);
  }
  .conference-card:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .conference-card-active {
    border-color: var(--foreground);
  }
  .source-icon {
    display: flex;
    height: 30px;
    width: 30px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 0.55rem;
    background: var(--muted);
    color: var(--muted-foreground);
  }
  :global(.source-badge) {
    border: 0;
    padding: 0.2rem 0.4rem;
    font-size: 10px;
    font-weight: 600;
    background: var(--muted);
    color: var(--muted-foreground);
  }
</style>
