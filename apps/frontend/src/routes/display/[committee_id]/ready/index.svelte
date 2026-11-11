<script lang="ts">
  import { t } from '$lib/i18n'
  import type { ConferenceDisplayData } from '$lib/classes/types/conference'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'

  let { data }: { data: ConferenceDisplayData } = $props()
</script>

<DisplayPage>
  <div class="flex flex-col items-center gap-6">
    <div class="text-9xl font-light tracking-[0.06em] text-white/20">{t('components_ready')}</div>
    {#if data.speakersList?.length > 0}
      <div class="text-base tracking-wider text-white/10">
        {t('components_speakers_count', { count: data.speakersList.length })}
      </div>
    {/if}
  </div>
</DisplayPage>
