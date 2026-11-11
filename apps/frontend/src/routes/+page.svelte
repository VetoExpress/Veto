<script lang="ts">
  import { t } from '$lib/i18n'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { onMount } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'

  onMount(() => {
    goto(resolve('/conference'))
  })
</script>

<div class="flex min-h-screen flex-col bg-background px-6 py-8">
  <main
    class="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    aria-live="polite"
  >
    <Spinner class="size-8 text-foreground" aria-label={t('procedure_loading')} />
    <p class="text-sm text-muted-foreground">{t('procedure_loading_please_wait')}</p>
  </main>

  <footer class="flex justify-center">
    <Button variant="outline" href={resolve('/conference')}>{t('procedure_go_to_conferences')}</Button>
  </footer>
</div>
