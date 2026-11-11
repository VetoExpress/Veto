<script lang="ts">
  import { t } from '$lib/i18n'
  import { Users } from '@lucide/svelte'
  import DisplayPage from '$lib/components/conference-display/display-page.svelte'
</script>

<DisplayPage>
  <div class="flex flex-col items-center gap-6 text-white/15">
    <Users size={56} />
    <div class="text-9xl font-light tracking-[0.06em]">{t('components_waiting_open')}</div>
    <div class="text-9xl font-light tracking-[0.06em]">{t('components_speakers_list')}</div>
    <div class="text-lg tracking-wider text-white/10">AWAITING SPEAKERS LIST</div>
  </div>
</DisplayPage>
