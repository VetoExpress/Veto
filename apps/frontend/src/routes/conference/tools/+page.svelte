<script lang="ts">
  import { t } from '$lib/i18n'
  import AppPage from '$lib/components/page-shell/app-page.svelte'
  import AppPageHeader from '$lib/components/page-shell/app-page-header.svelte'
</script>

<AppPage>
  <AppPageHeader title={t('procedure_tools')} />
  <p class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
    {t('procedure_feature_not_ready')}
  </p>
</AppPage>
