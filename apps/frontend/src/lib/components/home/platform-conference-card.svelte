<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import { ArrowRight, Cloud, MoreHorizontal } from '@lucide/svelte'
  import type { PlatformConference } from '$lib/classes/clients/account-conference-client'
  import { openPlatformConference } from '$lib/classes/stores/conference/platform-conference-store'
  import { Badge } from '$lib/components/ui/badge'

  let { conference }: { conference: PlatformConference } = $props()
  const lifecycleLabel = $derived(({ draft: t('settings_draft'), active: t('settings_active'), closed: t('settings_closed') })[conference.lifecycle])
</script>

<div class="platform-card group" onclick={() => openPlatformConference(conference)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPlatformConference(conference) } }} role="button" tabindex="0">
  <div class="flex min-w-0 items-center gap-3"><div class="source-icon"><Cloud class="size-[15px]" /></div><div class="min-w-0 flex-1"><div class="flex min-w-0 items-center gap-2"><h3 class="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{conference.name}</h3><Badge class="source-badge">{t('settings_cloud')}</Badge><Badge variant="outline" class="lifecycle-badge">{lifecycleLabel}</Badge></div><p class="mt-1 truncate text-[10px] text-slate-400">{conference.organizer ?? t('settings_cloud_platform')} · {formatDate(conference.updatedAt)}</p></div><MoreHorizontal class="size-4 shrink-0 text-slate-400 group-hover:hidden" /><span class="open-link opacity-0 transition-opacity group-hover:opacity-100">{t('settings_open_platform')} <ArrowRight class="ml-1 inline size-3" /></span></div>
  <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400"><span>{conference.committeeCount !== undefined ? t('settings_committee_count', { count: conference.committeeCount }) : t('settings_committee_count_unavailable')}</span><span>{conference.seatCount !== undefined ? t('settings_seat_count', { count: conference.seatCount }) : t('settings_seat_count_unavailable')}</span><span class="ml-auto font-semibold text-teal-700 dark:text-teal-300">{t('settings_open_platform')} <span class="ml-1">→</span></span></div>
</div>

<style>
  .platform-card { cursor: pointer; border: 1px solid #d8eee8; border-radius: .85rem; background: #fff; padding: 1rem 1.05rem; transition: border-color .15s, box-shadow .15s, transform .15s; } .platform-card:hover { border-color: #7fcbbd; box-shadow: 0 6px 16px #279a8712; transform: translateY(-1px); } :global(.dark) .platform-card { border-color: #24534f; background: #1b2d32; }
  .source-icon { display: flex; height: 30px; width: 30px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: .55rem; background: #e8f7f3; color: #279a87; } :global(.source-badge) { border: 0; background: #e8f7f3; color: #279a87; padding: .2rem .4rem; font-size: 9px; font-weight: 600; } :global(.lifecycle-badge) { border-color: #cfe6df; color: #4c8178; padding: .2rem .4rem; font-size: 9px; } .open-link { color: #279a87; font-size: 11px; font-weight: 600; }
</style>
