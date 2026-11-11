<script lang="ts">
  import { t, getLocale } from '$lib/i18n'
  import { ScrollText } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { ACTION_LABELS } from '$lib/classes/types/conference'
  import { getEntryDescription } from '$lib/classes/utils/committee/entry-description'
  import type { ConferenceEntry } from '$lib/classes/types/conference'

  interface Props {
    open: boolean
    minutes: ConferenceEntry[]
    onclose?: () => void
  }

  let { open = $bindable(), minutes, onclose }: Props = $props()

  const recentMinutes = $derived([...minutes].reverse().slice(0, 200))

  function formatTime(ts: number): string {
    const d = new Date(ts)
    return d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
</script>

<Dialog.Root bind:open onOpenChange={(value) => { if (!value) onclose?.() }}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-xl">
      <Dialog.Header class="pb-1">
        <Dialog.Title class="flex items-center gap-2 text-base font-semibold">
          <ScrollText size={18} class="text-indigo-500" />
          {t('procedure_meeting_log')}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          {t('procedure_meeting_log_count', { value1: minutes.length })}
        </Dialog.Description>
      </Dialog.Header>

      <div class="max-h-[65vh] overflow-y-auto rounded-md border bg-muted/30 p-3">
        {#if recentMinutes.length === 0}
          <p class="py-8 text-center text-xs text-muted-foreground">{t('procedure_no_meeting_records')}</p>
        {:else}
          <pre
            class="text-xs leading-relaxed text-foreground whitespace-pre-wrap font-mono">{recentMinutes
              .map((entry) => {
                const label = ACTION_LABELS[entry.actionType] ?? entry.actionType
                return `[${formatTime(entry.timestamp)}] [${label}] ${getEntryDescription(entry)}`
              })
              .join('\n')}</pre>
        {/if}
      </div>

      <Dialog.Footer class="pt-1">
        <Button variant="outline" onclick={() => (open = false)}>{t('procedure_close')}</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
