<script lang="ts">
  import { messageText, type LocalizedMessage } from '$lib/components/ui/localized-message'
  import { t } from '$lib/i18n'
  import {
    ExternalLink,
    FileText,
    MessageCircle,
    RefreshCw,
    Download,
    Loader,
    CheckCircle2,
    Terminal
  } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import SettingCard from '../../settings-card.svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { VETO_NAME } from '$lib/classes/const'
  import { fly } from 'svelte/transition'
  import { onMount, onDestroy } from 'svelte'

  const version = `${__APP_VERSION__}-${__APP_BUILD_TIME__}`
  import favicon from '$lib/assets/favicon.png'
  import { isElectron } from '$lib/classes/utils/runtime'

  // ── 更新状态 ──────────────────────────────────────────────────────
  type UpdateStatus =
    | 'idle' // 初始状态
    | 'checking' // 正在检查更新
    | 'not-available' // 已是最新版本
    | 'available' // 发现新版本，等待用户下载
    | 'downloading' // 正在下载
    | 'downloaded' // 下载完成，等待安装
    | 'error' // 出错

  let updateStatus = $state<UpdateStatus>('idle')
  let updateVersion = $state<string | null>(null)
  let downloadPercent = $state(0)
  let errorMessage = $state<LocalizedMessage | null>(null)
  let updateInfo = $state<unknown>(null)

  let unsubscribers: Array<() => void> = []

  onMount(() => {
    // 监听主进程的更新事件
    if (window.veto?.events) {
      unsubscribers.push(
        window.veto.events.on('updater:checking-for-update', () => {
          updateStatus = 'checking'
          errorMessage = null
        })
      )

      unsubscribers.push(
        window.veto.events.on('updater:update-available', (data: any) => {
          updateStatus = 'available'
          updateInfo = data
          updateVersion = data?.version ?? null
        })
      )

      unsubscribers.push(
        window.veto.events.on('updater:update-not-available', () => {
          updateStatus = 'not-available'
        })
      )

      unsubscribers.push(
        window.veto.events.on('updater:download-progress', (data: any) => {
          updateStatus = 'downloading'
          downloadPercent = data?.percent ?? 0
        })
      )

      unsubscribers.push(
        window.veto.events.on('updater:update-downloaded', (data: any) => {
          updateStatus = 'downloaded'
          updateInfo = data
          updateVersion = data?.version ?? updateVersion
          downloadPercent = 100
        })
      )

      unsubscribers.push(
        window.veto.events.on('updater:error', (data: any) => {
          updateStatus = 'error'
          errorMessage = data?.message ?? (() => t('settings_unknown_error'))
        })
      )
    }
  })

  onDestroy(() => {
    unsubscribers.forEach((fn) => fn())
  })

  // ── 操作 ──────────────────────────────────────────────────────────

  async function checkForUpdates(): Promise<void> {
    if (updateStatus === 'checking' || updateStatus === 'downloading') return

    updateStatus = 'checking'
    errorMessage = null
    updateVersion = null
    downloadPercent = 0

    try {
      const result = await window.veto.updater.check()
      if (!result.success) {
        updateStatus = 'error'
        errorMessage = result.error ?? (() => t('settings_check_failed'))
      }
      // 如果 checkForUpdates 返回了 null（updater 被禁用），且没有事件被触发
      if (result.result === null) {
        setTimeout(() => {
          if (updateStatus === 'checking') {
            updateStatus = 'error'
            errorMessage = () => t('settings_update_disabled')
          }
        }, 3000)
      }
    } catch (err: any) {
      updateStatus = 'error'
      errorMessage = err?.message ?? (() => t('settings_check_failed'))
    }
  }

  async function downloadUpdate(): Promise<void> {
    if (updateStatus === 'downloading') return

    try {
      const result = await window.veto.updater.download()
      if (!result.success) {
        updateStatus = 'error'
        errorMessage = result.error ?? (() => t('settings_download_failed'))
      }
    } catch (err: any) {
      updateStatus = 'error'
      errorMessage = err?.message ?? (() => t('settings_download_failed'))
    }
  }

  async function quitAndInstall(): Promise<void> {
    await window.veto.updater.quitAndInstall()
  }

  async function openDevTools(): Promise<void> {
    await window.veto.app.openDevTools()
  }
</script>

<div class="space-y-8" in:fly={{ y: 8, duration: 320, opacity: 0 }}>
  <div class="mb-1 flex justify-center">
    <img src={favicon} alt={t('settings_app_logo')} class="h-64 w-64 rounded-md" />
  </div>
  <div class="mb-6 flex flex-col items-center gap-2 text-center">
    <h2 class="text-3xl font-extrabold tracking-wide text-stone-800 dark:text-stone-100">
      {VETO_NAME}
    </h2>
    <p class="text-sm text-muted-foreground">{t('settings_veto_meaning')}</p>
    <p class="text-sm text-muted-foreground">{t('settings_app_description')}</p>
  </div>
  <div class="space-y-3">
    <SettingCard title={t('settings_version')} description={t('settings_current_version')}>
      <Label>v{version}</Label>
    </SettingCard>

    {#if isElectron()}
      <!-- 开发者工具 -->
      <SettingCard title={t('settings_devtools')} description={t('settings_devtools_description')}>
        <Button variant="outline" size="sm" onclick={openDevTools}>
          <Terminal size={13} class="mr-1.5" />
          {t('settings_open_devtools')}
        </Button>
      </SettingCard>

      <!-- 检查更新 -->
      <SettingCard
        title={t('settings_updates')}
        description={updateStatus === 'not-available'
          ? t('settings_update_latest')
          : updateStatus === 'available'
            ? t('settings_update_available', { version: updateVersion ?? '' })
            : updateStatus === 'downloading'
              ? t('settings_update_downloading')
              : updateStatus === 'downloaded'
                ? t('settings_update_ready')
                : updateStatus === 'error'
                  ? (messageText(errorMessage) || t('settings_update_error'))
                  : t('settings_update_description')}
      >
        <div class="flex items-center gap-2">
          {#if updateStatus === 'checking'}
            <Button variant="outline" size="sm" disabled>
              <Loader size={13} class="mr-1.5 animate-spin" />
              {t('settings_checking')}
            </Button>
          {:else if updateStatus === 'downloading'}
            <Button variant="outline" size="sm" disabled>
              <Loader size={13} class="mr-1.5 animate-spin" />
              {t('settings_download_progress', { percent: downloadPercent })}
            </Button>
          {:else if updateStatus === 'available'}
            <Button variant="default" size="sm" onclick={downloadUpdate}>
              <Download size={13} class="mr-1.5" />
              {t('settings_download_update')}
            </Button>
            <Button variant="ghost" size="sm" onclick={checkForUpdates}>
              <RefreshCw size={13} class="mr-1.5" />
              {t('settings_check_again')}
            </Button>
          {:else if updateStatus === 'downloaded'}
            <div class="flex items-center gap-2">
              <CheckCircle2 size={14} class="text-green-500" />
              <span class="text-xs text-green-600 dark:text-green-400">
                {t('settings_version_ready', { version: updateVersion ?? '' })}
              </span>
            </div>
            <Button variant="default" size="sm" onclick={quitAndInstall}>{t('settings_restart_install')}</Button>
          {:else if updateStatus === 'not-available'}
            <div class="flex items-center gap-2">
              <CheckCircle2 size={14} class="text-muted-foreground" />
              <span class="text-xs text-muted-foreground">{t('settings_up_to_date')}</span>
            </div>
            <Button variant="outline" size="sm" onclick={checkForUpdates}>
              <RefreshCw size={13} class="mr-1.5" />
              {t('settings_check_again')}
            </Button>
          {:else if updateStatus === 'error'}
            <Button variant="outline" size="sm" onclick={checkForUpdates}>
              <RefreshCw size={13} class="mr-1.5" />
              {t('settings_retry')}
            </Button>
          {:else}
            <Button variant="outline" size="sm" onclick={checkForUpdates}>
              <RefreshCw size={13} class="mr-1.5" />
              {t('settings_check_updates')}
            </Button>
          {/if}
        </div>
      </SettingCard>

      <!-- 下载进度条 (在 downloading 状态下显示) -->
      {#if updateStatus === 'downloading'}
        <div class="px-0.5">
          <div class="h-2 w-full rounded-full bg-muted">
            <div
              class="h-2 rounded-full bg-primary transition-all duration-300"
              style="width: {downloadPercent}%"
            ></div>
          </div>
        </div>
      {/if}
    {/if}
    <!-- 联系我们 -->
    <SettingCard title={t('settings_contact')} description={t('settings_contact_description')}>
      <Dialog.Root>
        <Dialog.Trigger>
          <Button variant="outline" size="sm">
            <MessageCircle size={13} class="mr-1.5" />
            {t('settings_contact')}
          </Button>
        </Dialog.Trigger>
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
              class="w-full justify-start"
            >
              <MessageCircle size={16} class="mr-2" />
              {t('settings_join_qq')}
            </Button>

            <Button
              variant="outline"
              href="https://discord.gg/"
              target="_blank"
              class="w-full justify-start"
              disabled
            >
              <ExternalLink size={16} class="mr-2" />
              {t('settings_join_discord')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </SettingCard>

    <SettingCard title={t('settings_license')} description={t('settings_license_description')}>
      <Button
        variant="outline"
        size="sm"
        href="https://github.com/Miaoyww/Veto/blob/master/LICENSE"
        target="_blank"
      >
        <FileText size={13} class="mr-1.5" />
        GPL-3.0
      </Button>
    </SettingCard>

    <SettingCard title={t('settings_repository')} description={t('settings_repository_description')}>
      <Button variant="outline" size="sm" href="https://github.com/Miaoyww/Veto" target="_blank">
        <ExternalLink size={13} class="mr-1.5" />
        Miaoyww/Veto
      </Button>
    </SettingCard>
  </div>
</div>
