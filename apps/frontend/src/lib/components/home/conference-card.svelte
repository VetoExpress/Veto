<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import {
    Trash2,
    Play,
    Pencil,
    Check,
    X,
    KeyRound,
    CalendarDays,
    Users,
    Building2,
    Armchair
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
  import { Card, CardHeader, CardTitle, CardAction, CardContent } from '$lib/components/ui/card'
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

  /** 本机为该云端大会保存的身份，按最近使用排序；第一个即「重新入会」将进入的席位 */
  const memberships = $derived(
    conference.source === 'cloud' ? getCloudMembershipsByConferenceId(conference.id) : []
  )

  function seatLabel(membership: CloudMembership): string {
    if (membership.isChair) {
      return membership.chairCommitteeName ? t('settings_chair_committee', { name: membership.chairCommitteeName }) : t('settings_chair')
    }
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

  function handleDelete(e: MouseEvent): void {
    e.stopPropagation()
    const isCloudConference = conference.source === 'cloud'
    showConfirm(
      isCloudConference ? t('settings_remove_local_confirm') : t('settings_confirm_delete'),
      isCloudConference
        ? t('settings_remove_conference_named', { name: conference.name })
        : t('settings_delete_conference_named', { name: conference.name }),
      () => (isCloudConference ? onDelete?.(conference) : deleteConference(conference.id))
    )
  }

  function startEdit(e: MouseEvent): void {
    e.stopPropagation()
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

  function handleInputKeydown(e: KeyboardEvent): void {
    e.stopPropagation()
    if (e.key === 'Enter') commitEdit()
    else if (e.key === 'Escape') cancelEdit()
  }

</script>

<Card
  class="group w-full gap-2 py-4 backdrop-blur-sm transition-all hover:shadow-md {isActive
    ? 'border-indigo-400 bg-card/90 dark:border-indigo-500'
    : 'bg-card/70 hover:bg-card/90'}"
>
  <CardHeader class="px-5">
    <CardTitle class="flex min-w-0 items-center gap-1.5 text-sm">
      {#if !conference.source && editing}
        <Input
          bind:ref={inputRef}
          bind:value={editName}
          class="h-7 min-w-0 flex-1 text-sm font-semibold"
          onclick={(e: MouseEvent) => e.stopPropagation()}
          onkeydown={handleInputKeydown}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0 text-green-600 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-900/30 dark:hover:text-green-300"
          title={t('settings_save')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            commitEdit()
          }}
        >
          <Check />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          title={t('settings_cancel')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            cancelEdit()
          }}
        >
          <X />
        </Button>
      {:else}
        <span class="truncate font-semibold">{conference.name}</span>
        {#if conference.source === 'cloud'}
          <Badge variant="outline" class="shrink-0">{t('settings_cloud')}</Badge>
        {:else if conference.mode === 'singleton'}
          <Badge variant="outline" class="shrink-0">{t('settings_singleton')}</Badge>
        {/if}
        {#if conference.source !== 'cloud'}
          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            title={t('settings_rename')}
            onclick={startEdit}
          >
            <Pencil />
          </Button>
        {/if}
      {/if}
    </CardTitle>

    <CardAction class="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
      <Button
        variant="outline"
        size="sm"
        class="gap-1 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50"
        onclick={(e: MouseEvent) => {
          e.stopPropagation()
          handleLoad()
        }}
      >
        <Play class="size-3" />
        {conference.source === 'cloud'
          ? t('settings_rejoin')
          : conference.mode === 'singleton'
            ? t('settings_chair_action')
            : t('settings_enter')}
      </Button>
      {#if conference.source === 'cloud'}
        <Button
          variant="ghost"
          size="icon-sm"
          title={t('settings_password_reenter')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            onUpdatePassword?.(conference)
          }}
        >
          <KeyRound />
        </Button>
      {/if}
      {#if conference.source !== 'cloud' || onDelete}
        <Button
          variant="destructive"
          size="icon-sm"
          title={conference.source === 'cloud' ? t('settings_remove_local') : t('settings_delete_conference')}
          onclick={handleDelete}
        >
          <Trash2 />
        </Button>
      {/if}
    </CardAction>
  </CardHeader>

  <CardContent class="px-5">
    {#if memberships.length > 0}
      <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span class="flex items-center gap-1 text-xs text-muted-foreground">
          <Armchair class="size-3" />
          {memberships.length > 1 ? t('settings_local_identities') : t('settings_current_seat')}
        </span>
        {#each memberships as membership, index (membership.seatId)}
          <Badge
            variant={index === 0 ? 'default' : 'secondary'}
            class="max-w-56 truncate text-[11px]"
            title={
              memberships.length > 1 && index === 0
                ? t('settings_recent_identity', { name: seatLabel(membership) })
                : seatLabel(membership)
            }
          >
            {seatLabel(membership)}
          </Badge>
        {/each}
      </div>
    {/if}
    <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span class="flex items-center gap-1">
        <Building2 class="size-3" />
        {t('settings_committee_count', { count: conference.committees.length })}
      </span>
      <span class="flex items-center gap-1">
        <CalendarDays class="size-3" />
        {formatDate(conference.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
      </span>
      <span class="flex items-center gap-1">
        <Users class="size-3" />
        {t('settings_seat_count', { count: conference.committees.reduce((count, committee) => count + committee.seats.length, 0) })}
      </span>
    </div>
  </CardContent>
</Card>
