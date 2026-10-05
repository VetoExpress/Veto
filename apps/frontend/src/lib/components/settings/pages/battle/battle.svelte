<script lang="ts">
  import { get } from 'svelte/store'
  import {
    currentBattle,
    currentBattleId,
    updateCurrentBattleSettings,
    clearLog,
    deleteBattle,
    getBattleById
  } from '$lib/classes/stores/battle/battle-store'
  import { showConfirm } from '$lib/classes/stores/app/global-ui-store'
  import SettingCard from '$lib/components/settings/cards/settings-card.svelte'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import DatePicker from '$lib/components/ui/date-picker.svelte'
  import EventConfigDialog from '$lib/components/dialog/event-config-dialog.svelte'
  import { Download, Trash2, ScrollText, Zap } from '@lucide/svelte'
  import { parseDate } from '@internationalized/date'
  import type { DateValue } from '@internationalized/date'
  import type { EventSetting } from '$lib/classes/types/battle'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { fly } from 'svelte/transition'

  const DISPLAY_SCALES = [60, 3600, 86400] as const
  const battleId = null

  let initial = get(currentBattle)
  onMount(() => {
    if (!initial && battleId) {
      // 如果当前没有战局但 URL 中有 battleId，说明用户直接访问了设置页，这时需要加载战局数据
      const battle = getBattleById(battleId)
      if (battle) initial = battle
    }
  })
  let nameDraft = $state(initial?.name ?? '')
  let startDateDraft = $state<DateValue | undefined>(
    initial?.startDate ? parseDate(initial.startDate) : undefined
  )
  let iconStyleDraft = $state<'nato' | 'simple'>(initial?.iconStyle ?? 'nato')
  let eventSettingsDraft = $state<EventSetting[]>([...(initial?.eventSettings ?? [])])
  let eventDrawerOpen = $state(false)

  // 日期变更自动保存（跳过首次渲染）
  let _dateInit = false
  $effect(() => {
    const d = startDateDraft
    if (!_dateInit) {
      _dateInit = true
      return
    }
    updateCurrentBattleSettings({ startDate: d?.toString() })
  })

  // 事件配置变更自动保存（跳过首次渲染）
  let _eventsInit = false
  $effect(() => {
    const ev = eventSettingsDraft
    if (!_eventsInit) {
      _eventsInit = true
      return
    }
    updateCurrentBattleSettings({ eventSettings: [...ev] })
  })

  function saveName() {
    const v = nameDraft.trim()
    if (v) updateCurrentBattleSettings({ name: v })
    else nameDraft = get(currentBattle)?.name ?? ''
  }

  let customScaleStr = $state(
    initial?.timeScale != null && !(DISPLAY_SCALES as readonly number[]).includes(initial.timeScale)
      ? String(initial.timeScale)
      : ''
  )

  function saveCustomScale() {
    const n = parseInt(customScaleStr, 10)
    if (n > 0) {
      updateCurrentBattleSettings({ timeScale: n })
    }
  }

  function saveIconStyle(style: 'nato' | 'simple') {
    iconStyleDraft = style
    updateCurrentBattleSettings({ iconStyle: style })
  }

  function handleExport() {
    const battle = get(currentBattle)
    if (!battle) return
    const json = JSON.stringify(battle, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${battle.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleClearLog() {
    showConfirm('清空行动日志', '此操作不可撤销，确定要清空所有行动记录吗？', () => clearLog())
  }

  function handleDelete() {
    const battle = get(currentBattle)
    const id = get(currentBattleId)
    if (!battle || !id) return
    showConfirm(`删除战局 "${battle.name}"`, '此操作不可撤销，战局数据将永久删除。', () => {
      deleteBattle(id)
      goto('/')
    })
  }

  const enabledEventCount = $derived(eventSettingsDraft.filter((e) => e.enabled).length)
</script>

<div class="space-y-6 pb-10" in:fly={{ y: 8, duration: 320, opacity: 0 }}>
  <!-- 基本信息 -->
  <div>
    <div class="mb-3 text-xl font-bold">基本信息</div>
    <div class="space-y-3">
      <SettingCard let:id title="战局名称" description="修改后失焦自动保存。">
        <Input
          {id}
          class="w-56"
          bind:value={nameDraft}
          onblur={saveName}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.target as HTMLElement).blur()
          }}
        />
      </SettingCard>

      <SettingCard let:id title="推演起始日期" description="战局时间轴的起始点。">
        <DatePicker bind:value={startDateDraft} class="z-1001 w-44" />
      </SettingCard>
    </div>
  </div>

  <!-- 地图设置 -->
  <div>
    <div class="mb-3 text-xl font-bold">地图设置</div>
    <div class="space-y-3">
      <SettingCard let:id title="图标风格" description="北约标准图标 或 简单图标。">
        <div class="flex gap-2">
          <Button
            variant={iconStyleDraft === 'nato' ? 'default' : 'outline'}
            size="sm"
            onclick={() => saveIconStyle('nato')}
          >
            北约标准
          </Button>
          <Button
            variant={iconStyleDraft === 'simple' ? 'default' : 'outline'}
            size="sm"
            onclick={() => saveIconStyle('simple')}
          >
            简单图标
          </Button>
        </div>
      </SettingCard>
    </div>
  </div>

  <!-- 模拟设置 -->
  <div>
    <div class="mb-3 text-xl font-bold">模拟设置</div>
    <div class="space-y-3">
      <SettingCard
        let:id
        title="自定义时间流速"
        description="保存后将在控制栏中作为可选档位显示，不会立即生效。"
      >
        <div class="flex items-center gap-2">
          <Input
            {id}
            type="number"
            min="1"
            class="w-24"
            bind:value={customScaleStr}
            placeholder="300"
            onblur={saveCustomScale}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') (e.target as HTMLElement).blur()
            }}
          />
          <span class="text-sm text-muted-foreground">秒/秒</span>
        </div>
      </SettingCard>
    </div>
  </div>

  <!-- 事件系统 -->
  <div>
    <div class="mb-3 text-xl font-bold">事件系统</div>
    <div class="space-y-3">
      <SettingCard let:id title="突发事件配置" description="配置战局中的随机突发事件及其触发概率。">
        <div class="flex items-center gap-3">
          <span class="text-sm text-muted-foreground">
            已启用 <span class="font-semibold text-amber-600">{enabledEventCount}</span>
            / {eventSettingsDraft.length} 项
          </span>
          <Button variant="outline" size="sm" onclick={() => (eventDrawerOpen = true)}>
            <Zap size={13} class="mr-1.5" />
            配置事件
          </Button>
        </div>
      </SettingCard>
    </div>
  </div>

  <!-- 数据管理 -->
  <div>
    <div class="mb-3 text-xl font-bold">数据管理</div>
    <div class="space-y-3">
      <SettingCard let:id title="导出战局数据" description="将当前战局数据导出为 JSON 文件。">
        <Button variant="outline" size="sm" onclick={handleExport}>
          <Download size={13} class="mr-1.5" />
          导出 JSON
        </Button>
      </SettingCard>

      <SettingCard
        let:id
        title="清空行动日志"
        description="清除所有已记录的行动历史，不影响单位和阵营。"
      >
        <Button
          variant="outline"
          size="sm"
          class="border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
          onclick={handleClearLog}
        >
          <ScrollText size={13} class="mr-1.5" />
          清空日志
        </Button>
      </SettingCard>

      <SettingCard let:id title="删除战局" description="永久删除此战局，所有数据将无法恢复。">
        <Button variant="destructive" size="sm" onclick={handleDelete}>
          <Trash2 size={13} class="mr-1.5" />
          删除战局
        </Button>
      </SettingCard>
    </div>
  </div>
</div>

<EventConfigDialog
  bind:open={eventDrawerOpen}
  bind:eventSettings={eventSettingsDraft}
  containerClass="fixed left-[calc(50%+26rem)] top-1/2 -translate-y-1/2 z-[1010] w-[360px] max-h-[80vh]"
/>
