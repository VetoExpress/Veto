<script lang="ts">
  import { t } from '$lib/i18n'
  import { AlertTriangle, Monitor } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { isElectron } from '$lib/classes/utils/runtime'

  let { open = $bindable(false) }: { open: boolean } = $props()

  let label = $state('')

  function handleOpenChange(value: boolean): void {
    if (!value) {
      label = ''
    }
    open = value
  }

  async function handleOpenDisplay(): Promise<void> {
    if (!isElectron()) {
      return
    }

    try {
      const result = await window.veto.conference.openDisplay({
        label: label.trim() || undefined
      })
      if (result.success) {
        open = false
        label = ''
      }
    } catch (err) {
      console.error('[DisplayOnly] Failed to open display:', err)
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-md">
      <Dialog.Header class="pb-1">
        <Dialog.Title class="flex items-center gap-2 text-base font-semibold">
          <Monitor size={18} class="text-indigo-500" />
          {t('procedure_display_only_mode')}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          {t('procedure_open_this_chair_s_local_display_window_display_receives_the_chair_s_local_projection_o')}
        </Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col gap-4 py-2">
        <!-- 标签 -->
        {#if isElectron()}
          <div>
            <Label class="mb-2 block text-xs text-muted-foreground">{t('procedure_window_label_optional')}</Label>
            <Input bind:value={label} placeholder={t('procedure_for_example_projector_second_screen')} class="h-9 text-sm" />
          </div>
        {/if}
        {#if !isElectron()}
          <div
            role="alert"
            class="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle class="mt-0.5 size-4 shrink-0" />
            <p>
              {t('procedure_display_only_mode_is_unavailable_here_visit')}
              <a
                href="https://veto.miaoyww.top"
                target="_blank"
                rel="noreferrer"
                class="font-medium underline underline-offset-2"
              >
                {t('procedure_veto_website')}
              </a>
              {t('procedure_to_download_the_desktop_app')}
            </p>
          </div>
        {/if}
      </div>

      <Dialog.Footer class="pt-1">
        <Button variant="outline" onclick={() => (open = false)}>{t('procedure_cancel')}</Button>
        {#if isElectron()}
          <Button onclick={handleOpenDisplay} class="min-w-[140px] gap-2">
            <Monitor size={14} />
            {t('procedure_open_display_window')}
          </Button>
        {/if}
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
