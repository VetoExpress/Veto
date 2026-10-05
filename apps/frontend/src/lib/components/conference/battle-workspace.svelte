<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import '$units'
  import Map from '$lib/components/map/map.svelte'
  import Header from '$lib/components/map/header.svelte'
  import LeftSidebar from '$lib/components/sidebar/left-sidebar.svelte'
  import Bottom from '$lib/components/bottom.svelte'
  import MessageLog from '$lib/components/panels/message-log.svelte'
  import UnitInfoPanel from '$lib/components/panels/unit-info-panel.svelte'
  import BattleSetup from './battle-setup.svelte'
  import {
    battlesReady, currentBattleId, currentFactionId, getConferenceBattle,
    loadBattle, flushRuntimePositions, saveBattlesNow
  } from '$lib/classes/stores/battle/battle-store'
  import { mods } from '$lib/classes/services/plugin/mod-registry.svelte'
  import { dbGetAllPlugins } from '$lib/classes/services/plugin/plugin-db'
  import { injectToRegistry } from '$lib/classes/services/plugin/plugin-registry'
  import { mapFlyTo, zoom } from '$lib/classes/stores/battle/map-store'
  import { gameClock, initGameClock } from '$lib/classes/services/engine/game-clock.store'
  import { stopEngine } from '$lib/classes/services/engine/simulation-engine'
  import { useKeyboardShortcuts } from '$lib/classes/services/hooks/use-keyboard-shortcuts.svelte'
  import { isElectron } from '$lib/classes/utils/runtime'

  let { conferenceId, conferenceName, onback }: {
    conferenceId: string
    conferenceName: string
    onback: () => void
  } = $props()
  let loaded = $state(false)
  let configured = $state(false)
  let error = $state('')
  let disposed = false
  useKeyboardShortcuts()

  function activateBattle(): void {
    const battle = getConferenceBattle(conferenceId)
    if (!battle) return
    mods.clear()
    mods.loadMods(isElectron() ? ['base', ...(battle.enabledMods ?? [])] : ['base'])
    loadBattle(battle.id)
    initGameClock(battle)
    zoom.set(battle.mapZoom)
    mapFlyTo.set({ lat: battle.mapCenter[0], lng: battle.mapCenter[1] })
    configured = true
  }

  onMount(async () => {
    currentBattleId.set(null)
    try {
      await battlesReady
      if (isElectron()) {
        const plugins = await dbGetAllPlugins()
        if (disposed) return
        for (const plugin of plugins) injectToRegistry(plugin)
      }
      if (disposed) return
      activateBattle()
      loaded = true
    } catch (cause) {
      if (!disposed) error = cause instanceof Error ? cause.message : '加载大会推演失败。'
    }
  })

  onDestroy(() => {
    disposed = true
    if (configured) {
      stopEngine()
      gameClock.update((clock) => ({ ...clock, isPaused: true }))
      flushRuntimePositions()
      void saveBattlesNow()
    }
    currentBattleId.set(null)
    currentFactionId.set(null)
    mods.clear()
  })
</script>

{#if error}
  <p role="alert" class="p-6 text-sm text-destructive">{error}</p>
{:else if !loaded}
  <p role="status" class="p-6 text-sm text-muted-foreground">正在加载大会推演…</p>
{:else if !configured}
  <div class="min-h-0 flex-1 overflow-y-auto">
    <BattleSetup {conferenceId} {conferenceName} oncreated={activateBattle} />
  </div>
{:else}
  <div class="relative min-h-0 flex-1 overflow-hidden bg-background">
    <div class="absolute inset-0"><Map /></div>
    <LeftSidebar />
    <Header class="top-5" {onback} />
    <Bottom />
    <MessageLog />
    <UnitInfoPanel />
  </div>
{/if}
