<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Timer, Play, Pause, RotateCcw, Clock, Square } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { formatTime } from '$lib/classes/formatters/time-formater'
  import {
    standaloneTimer,
    timerDialogOpen,
    startStandaloneTimer,
    pauseStandaloneTimer,
    resetStandaloneTimer
  } from '$lib/classes/stores/conference/timer-store'

  let { open = $bindable(false) }: { open: boolean } = $props()

  // 从 store 同步到 $bindable
  $effect(() => {
    const unsub = timerDialogOpen.subscribe((v) => {
      if (open !== v) open = v
    })
    return unsub
  })
  $effect(() => {
    timerDialogOpen.set(open)
  })

  // ── 预设时长（秒） ──
  const PRESETS = [
    { label: '30秒', sec: 30 },
    { label: '1分', sec: 60 },
    { label: '2分', sec: 120 },
    { label: '3分', sec: 180 },
    { label: '5分', sec: 300 },
    { label: '10分', sec: 600 },
    { label: '15分', sec: 900 },
    { label: '30分', sec: 1800 }
  ]

  // ── 本地输入状态 ──
  let inputMin = $state(2)
  let inputSec = $state(0)
  let localTotalSec = $state(120)

  // ── 从 store 派生 ──
  const timerState = $derived($standaloneTimer)
  const isRunning = $derived(timerState?.isRunning ?? false)
  const hasStarted = $derived(timerState != null)
  const remainingSec = $derived(timerState?.remainingSec ?? localTotalSec)
  const activeTotalSec = $derived(timerState?.totalSec ?? localTotalSec)

  function syncInputFromTotal(): void {
    inputMin = Math.floor(localTotalSec / 60)
    inputSec = localTotalSec % 60
  }

  function applyCustomTime(): void {
    const t = inputMin * 60 + inputSec
    selectPreset(Math.max(1, Math.min(3600, t)))
  }

  function handleOpenChange(value: boolean): void {
    // 关闭对话框不停止计时器
    if (!value) {
      // 如果计时器不在运行，不重置——让 store 保持原样
    }
    open = value
  }

  // ── 计时器控制 ──
  function handleStart(): void {
    startStandaloneTimer(localTotalSec)
  }

  function handlePause(): void {
    pauseStandaloneTimer()
  }

  function handleReset(): void {
    resetStandaloneTimer()
  }

  function selectPreset(sec: number): void {
    resetStandaloneTimer()
    localTotalSec = sec
    syncInputFromTotal()
  }

  // ── 派生显示值 ──
  const displaySec = $derived(hasStarted ? remainingSec : localTotalSec)
  const displayTotal = $derived(hasStarted ? activeTotalSec : localTotalSec)
  const progress = $derived(displayTotal > 0 ? displaySec / displayTotal : 0)
  const isExpired = $derived(!isRunning && hasStarted && remainingSec <= 0)

  // ── 颜色主题 ──
  const colorTheme = $derived.by(() => {
    if (isExpired) return 'red'
    if (isRunning && progress < 0.2) return 'red'
    if (isRunning && progress < 0.5) return 'amber'
    if (isRunning) return 'indigo'
    if (hasStarted) return 'amber' // paused
    return 'slate'
  })

  const ringColor = $derived.by(() => {
    switch (colorTheme) {
      case 'red': return 'stroke-red-500'
      case 'amber': return 'stroke-amber-500'
      case 'indigo': return 'stroke-indigo-500'
      default: return 'stroke-slate-300 dark:stroke-slate-600'
    }
  })

  const textColor = $derived.by(() => {
    switch (colorTheme) {
      case 'red': return 'text-red-600 dark:text-red-400'
      case 'amber': return 'text-amber-600 dark:text-amber-400'
      case 'indigo': return 'text-indigo-600 dark:text-indigo-300'
      default: return 'text-foreground'
    }
  })

  const bgGlow = $derived.by(() => {
    if (isExpired) return 'bg-red-500/10'
    if (isRunning && progress < 0.2) return 'bg-red-500/5 animate-pulse'
    return ''
  })

  // 圆环参数
  const radius = 96
  const circumference = 2 * Math.PI * radius
  const dashOffset = $derived(circumference * (1 - progress))
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-sm">
      <Dialog.Header class="pb-1">
        <Dialog.Title class="flex items-center gap-2 text-base font-semibold">
          <Clock size={18} class="text-indigo-500" />
          简易计时器
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          独立计时 · {hasStarted ? '后台运行中' : '不影响会议流程'}
        </Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col items-center gap-5 py-4">
        <!-- 圆环计时显示 -->
        <div class="relative flex items-center justify-center {bgGlow} rounded-full transition-colors duration-500">
          <svg width="216" height="216" viewBox="0 0 216 216" class="-rotate-90">
            <circle
              cx="108" cy="108" r={radius}
              fill="none"
              class="stroke-slate-200 dark:stroke-slate-700"
              stroke-width="6"
            />
            <circle
              cx="108" cy="108" r={radius}
              fill="none"
              class={ringColor}
              stroke-width="6"
              stroke-linecap="round"
              stroke-dasharray={circumference}
              stroke-dashoffset={dashOffset}
              style="transition: stroke-dashoffset 0.25s linear, stroke 0.5s ease"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-5xl font-mono font-bold tracking-tight tabular-nums {textColor} transition-colors duration-300">
              {formatTime(displaySec)}
            </span>
            <span class="mt-1 text-[11px] text-muted-foreground">
              {isExpired ? '⏰ 时间到！' : isRunning ? '计时中…' : hasStarted ? '已暂停' : '就绪'}
            </span>
          </div>
        </div>

        <!-- 控制按钮 -->
        <div class="flex items-center gap-3">
          {#if !isRunning}
            <Button
              size="lg"
              class="gap-2 min-w-24"
              disabled={isExpired}
              onclick={handleStart}
            >
              <Play size={16} />
              {hasStarted && !isExpired ? '继续' : '开始'}
            </Button>
          {:else}
            <Button
              size="lg"
              variant="outline"
              class="gap-2 min-w-24"
              onclick={handlePause}
            >
              <Pause size={16} />
              暂停
            </Button>
          {/if}
          <Button
            size="lg"
            variant="ghost"
            class="gap-2"
            disabled={!hasStarted}
            onclick={handleReset}
          >
            <Square size={16} />
            停止
          </Button>
        </div>

        <Separator />

        <!-- 自定义时间输入（暂停或到期后修改会开始新的计时） -->
        <div class="w-full space-y-2">
          <Label class="text-xs text-muted-foreground">自定义时长</Label>
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1.5">
              <Input
                type="number"
                min="0"
                max="59"
                bind:value={inputMin}
                class="h-9 w-18 text-center text-sm"
                disabled={isRunning}
                onchange={() => applyCustomTime()}
              />
              <span class="text-xs text-muted-foreground">分</span>
            </div>
            <div class="flex items-center gap-1.5">
              <Input
                type="number"
                min="0"
                max="59"
                bind:value={inputSec}
                class="h-9 w-18 text-center text-sm"
                disabled={isRunning}
                onchange={() => applyCustomTime()}
              />
              <span class="text-xs text-muted-foreground">秒</span>
            </div>
          </div>
        </div>

        <!-- 预设按钮 -->
        <div class="w-full space-y-2">
          <Label class="text-xs text-muted-foreground">快速预设</Label>
          <div class="grid grid-cols-4 gap-2">
            {#each PRESETS as preset (preset.sec)}
              <Button
                size="xs"
                variant={localTotalSec === preset.sec && !isRunning ? 'default' : 'outline'}
                class="h-8 text-xs"
                disabled={isRunning}
                onclick={() => selectPreset(preset.sec)}
              >
                {preset.label}
              </Button>
            {/each}
          </div>
        </div>
      </div>

      <Dialog.Footer class="pt-1">
        <Button variant="outline" onclick={() => (open = false)}>关闭</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
