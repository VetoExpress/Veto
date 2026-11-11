<script lang="ts">
  import { t, getLocale, setLocale } from '$lib/i18n'
  import SettingCard from '../../settings-card.svelte'
  import { Kbd, KbdGroup } from '$lib/components/ui/kbd'
  import * as Accordion from '$lib/components/ui/accordion/index.js'
  import { Button } from '$lib/components/ui/button'
  import { SHORTCUT_DEFS } from '$lib/classes/services/hooks/use-keyboard-shortcuts.svelte'
  import { clearAllBattles, importBattles } from '$lib/classes/stores/battle/battle-store'
  import { globalSettings } from '$lib/classes/stores/app/global-settings.store'
  import { showConfirm } from '$lib/classes/stores/app/global-ui-store'
  import { toast } from 'svelte-sonner'
  import { Switch } from '$lib/components/ui/switch'
  import { Upload, Trash2, Sun, Moon } from '@lucide/svelte'
  import { setMode, userPrefersMode } from 'mode-watcher'
  import { onDestroy } from 'svelte'
  import { fly } from 'svelte/transition'
  import { getThemeTransitionClipPaths } from './theme-transition'

  const GROUPS = ['危机推演', '模拟大会'] as const
  const groupLabels = $derived({ '危机推演': t('settings_group_battle'), '模拟大会': t('settings_group_conference') })

  const shortcutsByGroup = Object.fromEntries(
    GROUPS.map((g) => [g, SHORTCUT_DEFS.filter((d) => d.group === g)])
  ) as Record<(typeof GROUPS)[number], typeof SHORTCUT_DEFS>

  const THEME_TRANSITION_DURATION = 400
  let activeThemeAnimation: Animation | null = null
  let isThemeTransitioning = false

  function clearThemeTransition() {
    if (typeof document === 'undefined') return

    activeThemeAnimation?.cancel()
    activeThemeAnimation = null
    isThemeTransitioning = false

    const root = document.documentElement
    delete root.dataset.vetoThemeTransition
    root.style.removeProperty('--veto-theme-transition-clip-from')
  }

  onDestroy(clearThemeTransition)

  function handleThemeChange(nextMode: 'light' | 'dark', event: MouseEvent) {
    if (userPrefersMode.current === nextMode || isThemeTransitioning) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const button = event.currentTarget as HTMLElement | null
    const bounds = button?.getBoundingClientRect()
    const x = bounds ? bounds.left + bounds.width / 2 : viewportWidth / 2
    const y = bounds ? bounds.top + bounds.height / 2 : viewportHeight / 2
    const maxRadius = Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y))
    const applyMode = () => setMode(nextMode)

    if (typeof document.startViewTransition !== 'function') {
      applyMode()
      return
    }

    const clipPaths = getThemeTransitionClipPaths(x, y, maxRadius, viewportWidth, viewportHeight)
    const root = document.documentElement
    root.dataset.vetoThemeTransition = 'active'
    root.style.setProperty('--veto-theme-transition-clip-from', clipPaths[0])
    isThemeTransitioning = true

    const transition = document.startViewTransition(applyMode)
    transition.finished.finally(clearThemeTransition).catch(() => {})
    transition.ready
      .then(() => {
        if (typeof root.animate !== 'function') return
        activeThemeAnimation = root.animate(
          { clipPath: clipPaths },
          {
            duration: THEME_TRANSITION_DURATION,
            easing: 'ease-in-out',
            fill: 'forwards',
            pseudoElement: '::view-transition-new(root)'
          }
        )
      })
      .catch(() => {})
  }

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string)
          const [imported, skipped] = importBattles(data)
          if (imported > 0) {
            toast.success(
              t('settings_import_result', { imported, skipped })
            )
          } else {
            toast.warning(t('settings_import_empty', { skipped }))
          }
        } catch {
          toast.error(t('settings_invalid_json'))
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  function handleClearAll() {
    showConfirm(t('settings_clear_battles'), t('settings_clear_battles_confirm'), () => {
      clearAllBattles()
      toast.success(t('settings_battles_cleared'))
    })
  }
</script>

<div class="space-y-8" in:fly={{ y: 8, duration: 320, opacity: 0 }}>
  <!-- 界面 -->
  <div>
    <div class="mb-1 text-xl font-bold text-stone-800 dark:text-stone-100">{t('settings_appearance')}</div>
    <div class="space-y-3">
      <!-- 主题 -->
      <SettingCard title={t('settings_theme')} description={t('settings_theme_description')}>
        <div class="flex gap-1.5">
          <Button
            variant={userPrefersMode.current === 'light' ? 'secondary' : 'ghost'}
            size="sm"
            onclick={(event) => handleThemeChange('light', event)}
          >
            <Sun size={13} class="mr-1.5" />
            {t('settings_light')}
          </Button>
          <Button
            variant={userPrefersMode.current === 'dark' ? 'secondary' : 'ghost'}
            size="sm"
            onclick={(event) => handleThemeChange('dark', event)}
          >
            <Moon size={13} class="mr-1.5" />
            {t('settings_dark')}
          </Button>
        </div>
      </SettingCard>

      <!-- 语言 -->
      <SettingCard title={t('settings_language')} description={t('settings_language_description')}>
        <div class="flex gap-1.5">
          <Button
            variant={getLocale() === 'zh-CN' ? 'secondary' : 'ghost'}
            size="sm"
            onclick={() => { void setLocale('zh-CN'); globalSettings.patch({ language: 'zh-CN' }) }}
          >
            中文
          </Button>
          <Button
            variant={getLocale() === 'en-US' ? 'secondary' : 'ghost'}
            size="sm"
            onclick={() => { void setLocale('en-US'); globalSettings.patch({ language: 'en-US' }) }}
          >
            English
          </Button>
        </div>
      </SettingCard>

      <!-- 隐私 -->
      <SettingCard
        title={t('settings_analytics')}
        description={t('settings_analytics_description')}
      >
        <Switch
          checked={$globalSettings.usageAnalyticsEnabled}
          onCheckedChange={(checked) => globalSettings.patch({ usageAnalyticsEnabled: checked })}
        />
      </SettingCard>
    </div>
  </div>

  <!-- 快捷键 -->
  <div>
    <div class="mb-1 text-xl font-bold text-stone-800 dark:text-stone-100">{t('settings_shortcuts')}</div>
    <p class="mb-5 text-sm text-muted-foreground">{t('settings_shortcuts_description')}</p>

    <div class="space-y-6">
      {#each GROUPS as group (group)}
        <div>
          <Accordion.Root type="single">
            <Accordion.Item value="item-1">
              <Accordion.Trigger
                class="mb-2 text-sm font-semibold text-stone-500 dark:text-stone-400"
              >
                {groupLabels[group]}
              </Accordion.Trigger>
              <Accordion.Content>
                {#if shortcutsByGroup[group].length === 0}
                  <p class="text-xs text-muted-foreground">{t('settings_no_shortcuts')}</p>
                {:else}
                  <div class="space-y-2">
                    {#each shortcutsByGroup[group] as def (SHORTCUT_DEFS.indexOf(def))}
                      <SettingCard title={def.description}>
                        <KbdGroup>
                          {#if def.ctrl}<Kbd>Ctrl</Kbd>{/if}
                          {#if def.shift}<Kbd>Shift</Kbd>{/if}
                          {#if def.alt}<Kbd>Alt</Kbd>{/if}
                          <Kbd>{def.key}</Kbd>
                        </KbdGroup>
                      </SettingCard>
                    {/each}
                  </div>
                {/if}
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </div>
      {/each}
    </div>
  </div>

  <!-- 数据管理 -->
  <div>
    <div class="mb-1 text-xl font-bold text-stone-800 dark:text-stone-100">{t('settings_data_management')}</div>
    <div class="space-y-3">
      <SettingCard title={t('settings_import_battles')} description={t('settings_import_battles_description')}>
        <Button variant="outline" size="sm" onclick={handleImport}>
          <Upload size={13} class="mr-1.5" />
          {t('settings_import_file')}
        </Button>
      </SettingCard>
      <SettingCard title={t('settings_clear_battles')} description={t('settings_clear_battles_description')}>
        <Button
          variant="outline"
          size="sm"
          class="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
          onclick={handleClearAll}
        >
          <Trash2 size={13} class="mr-1.5" />
          {t('settings_clear_all')}
        </Button>
      </SettingCard>
    </div>
  </div>
</div>
