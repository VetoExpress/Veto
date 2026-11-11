<script lang="ts">
  import { t, getLocale } from '$lib/i18n'
  import { Play, Pause, SkipForward, Copy, Check } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { TimelineEngine, RATIO_PRESETS } from '$lib/classes/services/engine/timeline-engine.svelte'

  interface Props {
    engine: TimelineEngine
  }

  let { engine }: Props = $props()

  // ── 本地 UI 状态 ────────────────────────────────────────────────────

  /** 自定义倍率输入（字符串，方便编辑） */
  let customRatioInput = $state('')
  /** 跳转目标时间（datetime-local 格式字符串） */
  let jumpTarget = $state('')

  // ── 格式化函数 ──────────────────────────────────────────────────────

  function formatSimTime(ts: number): string {
    return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ts)
  }

  function formatRealTime(ts: number): string {
    return new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ts)
  }

  /** 将 JS 时间戳转为 datetime-local 输入格式 */
  function toDatetimeLocal(ts: number): string {
    const d = new Date(ts)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`
  }

  /** 将 datetime-local 字符串转为 JS 时间戳 */
  function fromDatetimeLocal(val: string): number {
    return new Date(val).getTime()
  }

  // ── 操作函数 ────────────────────────────────────────────────────────

  function applyCustomRatio(): void {
    const n = Number(customRatioInput)
    if (!isNaN(n) && Number.isInteger(n) && n >= 1) {
      engine.setRatio(n)
      customRatioInput = ''
    }
  }

  function applyJump(): void {
    if (jumpTarget) {
      engine.jumpTo(fromDatetimeLocal(jumpTarget))
    }
  }

  let copied = $state(false)

  async function copySimTime(): Promise<void> {
    await navigator.clipboard.writeText(formatSimTime(engine.currentSimTime))
    copied = true
    setTimeout(() => (copied = false), 1500)
  }

  /** 初始化跳转目标输入 */
  function updateJumpTarget(): void {
    jumpTarget = toDatetimeLocal(engine.currentSimTime)
  }
</script>

<div class="veto-card flex flex-col gap-6 p-6 max-w-2xl mx-auto">
  <!-- 标题 -->
  <h2 class="text-lg font-semibold text-foreground">{t('components_timeline_simulator')}</h2>

  <!-- 时间显示区 -->
  <div class="rounded-lg border border-border/50 bg-card/60 p-6 backdrop-blur-md">
    <div class="text-center">
      <div class="flex items-center justify-center gap-2 mb-1">
        <p class="text-sm text-muted-foreground">{t('components_current_sim_time')}</p>
        <Button
          variant="ghost"
          size="icon-xs"
          class="size-5 text-muted-foreground hover:text-foreground"
          title={t('components_copy_sim_time')}
          onclick={copySimTime}
        >
          {#if copied}
            <Check size={11} class="text-green-500" />
          {:else}
            <Copy size={11} />
          {/if}
        </Button>
      </div>
      <p class="text-4xl font-mono font-bold tabular-nums tracking-tight text-foreground">
        {formatSimTime(engine.currentSimTime)}
      </p>
      <p class="mt-2 text-sm text-muted-foreground font-mono">
        {t('components_real_time', { time: formatRealTime(engine.currentRealTime) })}
      </p>
    </div>
  </div>

  <!-- 暂停 / 继续 -->
  <div class="flex items-center justify-center gap-3">
    <Button
      variant={engine.paused ? 'default' : 'secondary'}
      size="lg"
      class="gap-2 min-w-32"
      onclick={() => engine.togglePause()}
    >
      {#if engine.paused}
        <Play size={18} />
        {t('components_start')}
      {:else}
        <Pause size={18} />
        {t('components_pause')}
      {/if}
    </Button>
  </div>

  <!-- 时间倍率 -->
  <div class="flex flex-col gap-2">
    <Label class="text-sm font-medium">{t('components_time_ratio')}</Label>
    <div class="flex flex-wrap gap-1.5">
      {#each RATIO_PRESETS as preset}
        <Button
          size="sm"
          variant={engine.ratio === preset.value ? 'default' : 'outline'}
          onclick={() => engine.setRatio(preset.value)}
        >
          {preset.value === 86400 ? t('components_day_per_second') : preset.value === 3600 ? t('components_hour_per_second') : preset.value === 60 ? t('components_minute_per_second') : `${preset.value}x`}
        </Button>
      {/each}
    </div>
  </div>

  <!-- 自定义倍率 -->
  <div class="flex items-end gap-2">
    <div class="flex flex-1 flex-col gap-1.5">
      <Label for="custom-ratio" class="text-sm font-medium">{t('components_custom_ratio')}</Label>
      <Input
        id="custom-ratio"
        type="number"
        min="1"
        step="1"
        placeholder={t('components_ratio_input')}
        bind:value={customRatioInput}
        oninput={(e) => {
          const input = e.currentTarget as HTMLInputElement
          input.value = input.value.replace(/[^\d]/g, '')
        }}
        onkeydown={(e) => e.key === 'Enter' && applyCustomRatio()}
      />
    </div>
    <Button size="sm" variant="outline" onclick={applyCustomRatio}>{t('components_apply')}</Button>
  </div>

  <!-- 分隔 -->
  <hr class="border-border/50" />

  <!-- 手动跳转 -->
  <div class="flex flex-col gap-2">
    <Label class="text-sm font-medium">{t('components_jump_to_time')}</Label>
    <div class="flex items-end gap-2">
      <div class="flex flex-1 flex-col gap-1.5">
        <Input type="datetime-local" bind:value={jumpTarget} onfocus={updateJumpTarget} />
      </div>
      <Button size="sm" variant="outline" onclick={applyJump}>
        <SkipForward size={16} class="mr-1" />
        {t('components_jump')}
      </Button>
    </div>
    <p class="text-xs text-muted-foreground">
      {t('components_current_time', { time: formatSimTime(engine.currentSimTime) })}
    </p>
  </div>

  <!-- 重置 -->
  <div class="flex justify-end">
    <Button variant="ghost" size="sm" onclick={() => engine.reset()}>{t('components_reset_defaults')}</Button>
  </div>
</div>
