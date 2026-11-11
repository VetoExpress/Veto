<script lang="ts">
  import { ExternalLink, MessageCircle } from '@lucide/svelte'
  import { t } from '$lib/i18n'
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'

  const version = `${__APP_VERSION__}-${__APP_BUILD_TIME__}`
  let contactDialogOpen = $state(false)
</script>

<footer
  class="flex h-[30px] shrink-0 items-center justify-between border-t px-6 text-[10px] text-muted-foreground lg:px-8"
>
  <span>Veto {version}</span>
  <button
    type="button"
    class="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onclick={() => (contactDialogOpen = true)}
  >
    {t('procedure_need_help')}
  </button>
</footer>

<Dialog.Root bind:open={contactDialogOpen}>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>{t('settings_contact')}</Dialog.Title>
      <Dialog.Description>{t('settings_contact_platform')}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-3 py-4">
      <Button
        variant="outline"
        href="https://qm.qq.com/q/pTvxDLoiVq"
        target="_blank"
        rel="noreferrer"
        class="w-full justify-start"
      >
        <MessageCircle />
        {t('settings_join_qq')}
      </Button>
      <Button
        variant="outline"
        href="https://github.com/Miaoyww/Veto/issues"
        target="_blank"
        rel="noreferrer"
        class="w-full justify-start"
      >
        <ExternalLink />
        {t('procedure_report_issue')}
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
