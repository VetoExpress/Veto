<script lang="ts">
  import { t, formatDate } from '$lib/i18n'
  import { page } from '$app/state'
  import { resolve } from '$app/paths'
  import { ScrollText } from '@lucide/svelte'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { currentCommittee } from '$lib/classes/stores/conference/conference-store'
  import { ACTION_LABELS } from '$lib/classes/types/conference'
  import { getEntryDescription } from '$lib/classes/utils/committee/entry-description'
  import { VETO_NAME } from '$lib/classes/const'

  const conferenceId = $derived(page.params.conference_id ?? '')
  const committeeId = $derived(page.params.committee_id ?? '')
  const conf = $derived($currentCommittee)
  const recentMinutes = $derived(conf?.minutes.slice(-200).reverse() ?? [])
  const logText = $derived(
    recentMinutes
      .map((entry) => {
        const time = formatDate(entry.timestamp, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
        const label = ACTION_LABELS[entry.actionType] ?? entry.actionType
        return `[${time}] [${label}] ${getEntryDescription(entry)}`
      })
      .join('\n')
  )
</script>

<svelte:head>
  <title>{t('procedure_meeting_log')} · {VETO_NAME}</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
  <PageTopBar
    icon={ScrollText}
    title={t('procedure_meeting_log')}
    subtitle={conf?.name}
    backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
    backLabel={t('procedure_back_to_meeting')}
  />

  <ScrollArea class="min-h-0 flex-1">
    <div class="mx-auto max-w-4xl px-6 py-6">
      {#if conf}
        <p class="mb-4 text-sm text-muted-foreground">
          {t('procedure_meeting_log_count', { value1: conf.minutes.length })}
        </p>
        <div class="rounded-lg border bg-muted/30 p-4">
          {#if recentMinutes.length === 0}
            <p class="py-8 text-center text-sm text-muted-foreground">
              {t('procedure_no_meeting_records')}
            </p>
          {:else}
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">{logText}</pre>
          {/if}
        </div>
      {:else}
        <p class="py-12 text-center text-sm text-muted-foreground">
          {t('procedure_select_or_create_a_conference')}
        </p>
      {/if}
    </div>
  </ScrollArea>
</div>
