<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * display/[committee_id]/+page.svelte
   * ──────────────────────────────────────────────
   * Display 窗口 Shell —— 唯一入口。
   *
   * 职责：
   * 1. WebSocket 连接（唯一）
   * 2. 顶部横幅 + 阶段指示器（渲染一次，横幅为窗口拖拽区）
   * 3. 根据 phase 动态切换内容组件
   * 4. 底部近期记录
   * 5. 窗口管理（悬停浮现的系统窗口控件、全屏状态同步）
   */
  import { onMount, onDestroy } from 'svelte'
  import {
    getDisplayBridge,
    onConnectionStatus
  } from '$lib/classes/clients/conference-display-client'
  import type { ConnectionStatus } from '$lib/classes/clients/conference-display-client'
  import {
    toggleDisplayFullscreen,
    onDisplayWindowUpdate
  } from '$lib/classes/clients/display-window'
  import type { SeatView } from '$lib/classes/types/conference'
  import type { ConferenceDisplayData, TimerTickData } from '$lib/classes/types/conference'
  import { VETO_NAME, ROLL_CALL_MARK_DELAY } from '$lib/classes/const'
  import { globalSettings } from '$lib/classes/stores/app/global-settings.store'
  import { useKeyboardShortcuts } from '$lib/classes/services/hooks/use-keyboard-shortcuts.svelte'
  import WindowControls from '$lib/components/app-sidebar/window-controls.svelte'

  import RollCallDisplay from './roll-call/index.svelte'
  import GeneralDebateDisplay from './general-debate/index.svelte'
  import MotionDisplay from './motion/index.svelte'
  import QuestionDisplay from './question/index.svelte'
  import CaucusSetupDisplay from './caucus-setup/index.svelte'
  import CaucusDisplay from './caucus/index.svelte'
  import ConferenceHeader from '$lib/components/conference-display/conference-header.svelte'
  import VotingDisplay from './voting/index.svelte'
  import PendingSpeakersListDisplay from './pending-speakers-list/index.svelte'
  import SuspendedDisplay from './suspended/index.svelte'
  import ClosedDisplay from './closed/index.svelte'
  import ReadyDisplay from './ready/index.svelte'
  import ConnectionStatusDisplay from './connection-status/index.svelte'
  import AttendanceChangeDisplay from './attendance-change.svelte'
  import type { DisplayPhase } from '$lib/classes/types/committee-display'

  let displayData = $state<ConferenceDisplayData | null>(null)
  let connectionStatus = $state<ConnectionStatus>('connecting')
  let isFullScreen = $state(false)

  // 主展示区位置偏移（从全局设置加载，Alt+方向键微调后自动持久化）
  let displayOffsetX = $state(0)
  let displayOffsetY = $state(0)

  $effect(() => {
    displayOffsetX = $globalSettings.displayOffsetX
    displayOffsetY = $globalSettings.displayOffsetY
  })

  const contentStyle = $derived(`transform: translate(${displayOffsetX}px, ${displayOffsetY}px)`)

  // 快捷键（Display 窗口专用：Escape 退出全屏、Alt+方向键微调位置）
  useKeyboardShortcuts({
    context: 'conference-display',
    isFullScreen: () => isFullScreen,
    toggleFullscreen: toggleDisplayFullscreen
  })

  // ---- 悬停浮现的窗口控件（复用系统 WindowControls，Electron 下渲染按钮） ----
  let controlsVisible = $state(false)
  let controlsHideTimer: ReturnType<typeof setTimeout> | null = null

  function showWindowControls(): void {
    if (controlsHideTimer) {
      clearTimeout(controlsHideTimer)
      controlsHideTimer = null
    }
    controlsVisible = true
  }

  function hideWindowControls(): void {
    if (controlsHideTimer) clearTimeout(controlsHideTimer)
    controlsHideTimer = setTimeout(() => {
      controlsVisible = false
      controlsHideTimer = null
    }, 400)
  }

  onMount(() => {
    const bridge = getDisplayBridge()
    const unsubData = bridge.onHostCommand((data: ConferenceDisplayData) => {
      displayData = data
    })

    // 计时器增量更新（ADR-0002）：Display 不维护计时器，仅被动渲染 Host 推送的数值
    const unsubTick = bridge.onTimerTick((tick: TimerTickData) => {
      if (displayData?.currentSpeaker) {
        displayData = {
          ...displayData,
          currentSpeaker: {
            ...displayData.currentSpeaker,
            remainingSec: tick.remainingSec,
            status: tick.status
          }
        }
      }
      // caucus 计时器同步
      if (displayData?.caucusTimer) {
        displayData = {
          ...displayData,
          caucusTimer: {
            ...displayData.caucusTimer,
            remainingSec: tick.remainingSec,
            status: tick.status === 'playing' ? 'running' : tick.status
          }
        }
      }
    })

    const unsubStatus = onConnectionStatus((status: ConnectionStatus) => {
      connectionStatus = status
    })

    // 主进程推送的窗口事件（全屏状态变更等）
    const unsubDisplayUpdate = onDisplayWindowUpdate((update) => {
      if (update.type === 'fullscreen-change') {
        isFullScreen = update.isFullScreen ?? false
      }
    })

    return () => {
      unsubData()
      unsubTick()
      unsubStatus()
      unsubDisplayUpdate()
    }
  })

  const headerThresholds = $derived.by(() => {
    const voting = displayData?.votingCount
    if (voting != null && voting > 0) {
      return {
        simpleMajority: Math.floor(voting / 2) + 1,
        twoThirds: Math.ceil((voting * 2) / 3)
      }
    }
    return null
  })

  // 特殊动议（isRequestingVote: false）不应触发 MotionDisplay
  const isSpecialMotion = $derived(displayData?.motionDraft?.isRequestingVote === false)
  const hasActiveMotion = $derived(displayData?.activeMotion != null)

  // 表决结果延迟转跳：当动议通过/否决后，先展示 3 秒结果再转跳
  let effectivePhase = $state<DisplayPhase | null>(null)
  let phaseDelayTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const newPhase = displayData?.phase ?? null
    const motionStatus = displayData?.activeMotion?.status

    // 延迟计时器激活期间不干涉
    if (phaseDelayTimer) return

    // 相同则跳过
    if (newPhase === effectivePhase) return

    // 从 motion 结果阶段切换到其他阶段 → 延迟 3 秒
    if (
      effectivePhase === 'motion' &&
      motionStatus != null &&
      motionStatus !== 'pending' &&
      newPhase !== 'motion'
    ) {
      phaseDelayTimer = setTimeout(() => {
        // 取最新的 phase（避免延迟期间 phase 再次变更）
        effectivePhase = displayData?.phase ?? null
        phaseDelayTimer = null
      }, 3000)
      return
    }

    effectivePhase = newPhase
  })

  onDestroy(() => {
    if (phaseDelayTimer) clearTimeout(phaseDelayTimer)
    if (attendanceTimer) clearTimeout(attendanceTimer)
    if (controlsHideTimer) clearTimeout(controlsHideTimer)
  })

  // ---- 出席状态变更（全屏展示） ----
  // 来源：changeSeatAttendance（attendanceChange 字段）或点名（rollCall.lastMarked）
  let attendanceChange = $state<SeatView | null>(null)
  let attendanceTimer: ReturnType<typeof setTimeout> | null = null
  let _lastAttendanceId = $state('')

  $effect(() => {
    const change = displayData?.attendanceChange
    if (change) {
      const notifId = `${change.id}-${change.procedure?.attendance}`
      if (notifId === _lastAttendanceId) return
      _lastAttendanceId = notifId

      if (attendanceTimer) clearTimeout(attendanceTimer)
      attendanceChange = change

      attendanceTimer = setTimeout(() => {
        attendanceChange = null
      }, ROLL_CALL_MARK_DELAY)
      return
    }

    // 点名阶段兼容：rollCall.lastMarked
    const lastMarked = displayData?.rollCall?.lastMarked
    if (lastMarked) {
      const notifId = `${lastMarked.seat.name}-${lastMarked.status}`
      if (notifId === _lastAttendanceId) return
      _lastAttendanceId = notifId

      if (attendanceTimer) clearTimeout(attendanceTimer)
      attendanceChange = {
        ...lastMarked.seat,
        procedure: {
          attendance: lastMarked.status,
          hasVotingRights: lastMarked.seat.procedure?.hasVotingRights ?? true,
          sortOrder: lastMarked.seat.procedure?.sortOrder ?? 0,
          flagUrl: lastMarked.seat.procedure?.flagUrl
        }
      }

      attendanceTimer = setTimeout(() => {
        attendanceChange = null
      }, ROLL_CALL_MARK_DELAY)
    }
  })
</script>

<svelte:head>
  <title>{t('components_display_title', { name: VETO_NAME })}</title>
</svelte:head>

<style>
  :global(body) {
    background: #0a0e14;
    color: #c8ccd4;
    overflow: hidden;
  }

  /* 悬停浮现的窗口控件：右上角固定热区，控件默认隐藏、悬停淡入 */
  .display-controls-anchor {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 50;
    height: 2.5rem;
    width: 10rem;
  }

  .display-controls {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: flex-end;
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
  }

  .display-controls.visible {
    opacity: 1;
    pointer-events: auto;
  }

  /* 投影暗色配色：覆盖 ghost 按钮的语义色（Display 视图整体为固定暗色调） */
  .display-controls :global(button:not(.close-btn)) {
    color: rgb(255 255 255 / 0.55);
  }

  .display-controls :global(button:not(.close-btn):hover) {
    background-color: rgb(255 255 255 / 0.1);
    color: rgb(255 255 255 / 0.9);
  }
</style>

<div class="flex h-screen w-screen flex-col bg-[#0a0e14] text-[#c8ccd4]">
  <!-- 悬停浮现的窗口控件 -->
  <div
    class="display-controls-anchor"
    role="presentation"
    onpointerenter={showWindowControls}
    onpointerleave={hideWindowControls}
  >
    <div class="display-controls no-drag" class:visible={controlsVisible}>
      <WindowControls showSettings={false} />
    </div>
  </div>

  {#if displayData}
    <!-- 顶部横幅兼作窗口拖拽区 -->
    <div class="drag-region">
      <ConferenceHeader
        venue={displayData.venue}
        name={displayData.name}
        phase={effectivePhase}
        simpleMajority={headerThresholds?.simpleMajority}
        twoThirds={headerThresholds?.twoThirds}
      />
    </div>

    <!-- 出席状态变更（来自代表管理，全屏覆盖） -->
    {#if attendanceChange}
      <AttendanceChangeDisplay
        seatName={attendanceChange.name}
        shortName={attendanceChange.shortName}
        status={attendanceChange.procedure?.attendance ?? 'absent'}
      />
    {:else}
      <!-- 主展示区（phase 动态切换） -->
      <div
        class="flex flex-1 items-center justify-center overflow-hidden px-16"
        style={contentStyle}
      >
        {#if displayData.pointDraft?.proposedBy || displayData.activePoint}
          <QuestionDisplay data={displayData} />
        {:else if effectivePhase === 'motion' && !isSpecialMotion && hasActiveMotion}
          <MotionDisplay data={displayData} />
        {:else if effectivePhase === 'roll_call'}
          <RollCallDisplay data={displayData} />
        {:else if effectivePhase === 'general_debate'}
          <GeneralDebateDisplay data={displayData} />
        {:else if effectivePhase === 'caucus_setup'}
          <CaucusSetupDisplay data={displayData} />
        {:else if displayData.caucusTimer && effectivePhase === 'caucus'}
          <CaucusDisplay data={displayData} />
        {:else if displayData.votingSession && effectivePhase === 'voting'}
          <VotingDisplay data={displayData} />
        {:else if effectivePhase === 'pending_speakers_list'}
          <PendingSpeakersListDisplay />
        {:else if effectivePhase === 'suspended'}
          <SuspendedDisplay />
        {:else if effectivePhase === 'closed'}
          <ClosedDisplay />
        {:else}
          <ReadyDisplay data={displayData} />
        {/if}
      </div>
    {/if}
  {:else}
    <ConnectionStatusDisplay status={connectionStatus} />
  {/if}
</div>
