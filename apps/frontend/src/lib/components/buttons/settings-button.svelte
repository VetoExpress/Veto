<script lang="ts">
  import { t } from '$lib/i18n'
  import { Button } from '$lib/components/ui/button'
  import { Settings } from '@lucide/svelte'
  import { tweened } from 'svelte/motion'
  import { cubicInOut, linear } from 'svelte/easing'
  import { settingsDialogOpen } from '$lib/classes/stores/app/global-ui-store'

  const rotate = tweened(0, { duration: 300, easing: cubicInOut })
  const scale = tweened(1, { duration: 200, easing: cubicInOut })
  let hovering = false

  async function handleMouseEnter(): Promise<void> {
    hovering = true
    scale.set(1.15, { duration: 100, easing: cubicInOut })
    while (hovering) {
      // 从 0° → 360° 平滑旋转一圈
      await rotate.set(360, { duration: 4000, easing: linear })
      if (!hovering) break

      // 立即重置为 0°，不影响视觉连续性
      rotate.set(0, { duration: 0 })
    }
  }

  function handleMouseLeave(): void {
    hovering = false
    scale.set(1, { duration: 100, easing: cubicInOut })
    rotate.set(0, { duration: 300, easing: cubicInOut })
  }

  async function openSetting(): Promise<void> {
    settingsDialogOpen.set(true)

    await rotate.set(180, { duration: 400, easing: cubicInOut })
    rotate.set(0, { duration: 0 })
    hovering = true
  }
</script>

<Button
  title={t('components_settings')}
  aria-label={t('components_settings')}
  variant="ghost"
  onclick={openSetting}
  size="icon"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <Settings class="select-none" style="transform: rotate({$rotate}deg) scale({$scale})" />
</Button>
