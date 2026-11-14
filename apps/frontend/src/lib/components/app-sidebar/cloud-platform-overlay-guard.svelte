<script lang="ts">
  import { onMount } from 'svelte'
  import { cloudPlatformView } from '$lib/classes/stores/app/cloud-platform-view.svelte'

  const OVERLAY_SELECTOR = [
    '[data-slot="dialog-overlay"]',
    '[data-slot="select-content"]',
    '[data-slot="dropdown-menu-content"]',
    '[data-slot="popover-content"]'
  ].join(',')

  let platformOpen = false
  let viewVisible = true
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let showTimer: ReturnType<typeof setTimeout> | undefined

  function hasOverlay(): boolean {
    return Boolean(document.querySelector(OVERLAY_SELECTOR))
  }

  function clearTimers(): void {
    if (hideTimer) clearTimeout(hideTimer)
    if (showTimer) clearTimeout(showTimer)
    hideTimer = undefined
    showTimer = undefined
  }

  function syncVisibility(): void {
    if (!platformOpen) return
    clearTimers()
    const overlayOpen = hasOverlay()
    if (overlayOpen && viewVisible) {
      hideTimer = setTimeout(() => {
        if (!platformOpen || !hasOverlay()) return
        viewVisible = false
        cloudPlatformView.setVisible(false)
      }, 30)
      return
    }
    if (!overlayOpen && !viewVisible) {
      showTimer = setTimeout(() => {
        if (!platformOpen || hasOverlay()) return
        viewVisible = true
        cloudPlatformView.setVisible(true)
      }, 80)
    }
  }

  function forwardWheel(event: WheelEvent): void {
    if (!platformOpen || !viewVisible || hasOverlay()) return
    event.preventDefault()
    cloudPlatformView.wheel({
      x: event.clientX,
      y: event.clientY,
      deltaX: event.deltaX,
      deltaY: event.deltaY
    })
  }

  onMount(() => {
    const unsubscribe = cloudPlatformView.subscribe((state) => {
      if (state.open === platformOpen) return
      platformOpen = state.open
      clearTimers()
      if (!platformOpen) {
        viewVisible = true
        return
      }
      syncVisibility()
    })
    const observer = new MutationObserver(syncVisibility)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'data-open']
    })
    window.addEventListener('wheel', forwardWheel, { passive: false })

    return () => {
      unsubscribe()
      observer.disconnect()
      window.removeEventListener('wheel', forwardWheel)
      clearTimers()
    }
  })
</script>
