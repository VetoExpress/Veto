<script lang="ts">
  import { t } from '$lib/i18n'
  import SidebarIcon from '@lucide/svelte/icons/sidebar'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  const sidebar = Sidebar.useSidebar()
</script>

<header class="sticky top-0 z-50 flex w-full items-center border-b bg-background">
  <div class="flex h-(--header-height) w-full items-center gap-2 px-4">
    <Button class="size-8" variant="ghost" size="icon" onclick={sidebar.toggle} aria-label={t('settings_toggle_sidebar')}>
      <SidebarIcon />
    </Button>
    <Separator orientation="vertical" class="me-2 h-4" />
  </div>
</header>

<!-- 顶部横幅：阶段 + 控制 -->
<!-- <div class="flex items-center gap-3 border-b px-6 py-3">
      <div class="flex items-center gap-2">
        <Gavel size={16} class="text-indigo-500" />
        <span class="text-sm font-semibold text-foreground">
          {PHASE_LABELS[conf.phase] ?? conf.phase}
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        {#if wsPort !== null}
          <span
            class="select-none text-[11px] text-muted-foreground/70"
            title="WebSocket 端口：{wsPort}"
          >
            WS :{wsPort}
          </span>
        {/if}

        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 text-xs"
          title="打开显示窗口（投影/第二屏幕）"
          onclick={openDisplayWindow}
        >
          <Monitor size={12} />
          显示窗口
        </Button>

        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 text-xs"
          title="会议日志"
          onclick={() => (logDialogOpen = true)}
        >
          <ScrollText size={12} />
          日志
        </Button>

        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 text-xs"
          title="打开简易计时器"
          onclick={() => {
            timerDialogOpen.set(true)
          }}
        >
          <Timer size={12} />
          计时器
        </Button>

        {#if canProposePoint}
          <Button
            size="sm"
            variant="outline"
            class="h-8 gap-1.5 text-xs"
            title="提出问题"
            onclick={() => (pointDialogOpen = true)}
          >
            <HelpCircle size={12} />
            问题
          </Button>
        {/if}

        {#if primaryActionLabel}
          <Button
            size="sm"
            class="h-8 gap-1.5 text-xs"
            onclick={handlePrimaryAction}
            disabled={!canProposeMotion}
            title={isTimerActive
              ? '发言计时进行中，无法提出动议'
              : isMotionInProgress
                ? '磋商进行中，无法提出新动议'
                : ''}
          >
            <Play size={12} />
            {primaryActionLabel}
          </Button>
        {/if}

        {#if conf.phase === 'suspended'}
          <Button size="sm" variant="outline" class="h-8 gap-1.5 text-xs" onclick={resumeMeeting}>
            <Play size={12} />
            恢复会议
          </Button>
        {/if}
      </div>
    </div> -->
