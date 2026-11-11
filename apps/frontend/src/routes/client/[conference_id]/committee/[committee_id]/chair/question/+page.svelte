<script lang="ts">
  import { t } from '$lib/i18n'
  /**
   * conference/[conference_id]/question.svelte
   * ─────────────────────────────────────────
   * 问题页面 —— 提交问题后导航至此页，主席可随时结束问题返回。
   */
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { AlertTriangle, HelpCircle, User } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import {
    currentCommittee,
    dismissLatestPoint
  } from '$lib/classes/stores/conference/conference-store'
  import { POINT_LABELS } from '$lib/classes/types/conference'
  import type { PointType } from '$lib/classes/types/conference'
  import PageTopBar from '$lib/components/conference/common/page-top-bar.svelte'
  import { VETO_NAME } from '$lib/classes/const'

  const conferenceId = $derived(page.params.conference_id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  const conf = $derived($currentCommittee)

  const latestPoint = $derived(
    conf && conf.points.length > 0 ? conf.points[conf.points.length - 1] : null
  )

  const proposerDel = $derived(
    latestPoint ? conf?.seats.find((d) => d.id === latestPoint.proposedBySeatId) : null
  )

  const POINT_ICONS: Record<PointType, typeof AlertTriangle> = {
    point_of_order: AlertTriangle,
    point_of_inquiry: HelpCircle,
    point_of_personal_privilege: User
  }

  const POINT_COLORS: Record<PointType, string> = {
    point_of_order: 'text-amber-500',
    point_of_inquiry: 'text-blue-500',
    point_of_personal_privilege: 'text-emerald-500'
  }

  const POINT_BG_COLORS: Record<PointType, string> = {
    point_of_order: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30',
    point_of_inquiry: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30',
    point_of_personal_privilege:
      'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
  }

  function handleEnd(): void {
    dismissLatestPoint()
    goBack()
  }

  function goBack(): void {
    if (conf) {
      goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair`))
    }
  }

  // 如果没有最近的问题，自动返回
  $effect(() => {
    if (conf && !latestPoint) {
      goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair`))
    }
  })
</script>

<svelte:head>
  <title>{t('procedure_point_page_title', { value1: VETO_NAME })}</title>
</svelte:head>

<div class="flex h-full w-full flex-col bg-background">
  {#if conf && latestPoint}
    {@const Icon = POINT_ICONS[latestPoint.type] ?? HelpCircle}
    {@const iconColor = POINT_COLORS[latestPoint.type]}
    {@const bgColor = POINT_BG_COLORS[latestPoint.type]}

    <PageTopBar
      icon={HelpCircle}
      title={t('procedure_point')}
      subtitle={conf?.name}
      iconClass={iconColor}
      backHref={resolve(`/client/${conferenceId}/committee/${committeeId}/chair`)}
    />

    <!-- 主内容 -->
    <div class="flex flex-1 items-center justify-center p-8">
      <div class="flex w-full max-w-xl flex-col gap-6">
        <!-- 问题详情 -->
        <div class="rounded-lg border-2 {bgColor} p-8 text-center">
          <div class="flex items-center justify-center gap-2">
            <Icon size={24} class={iconColor} />
            <span class="text-lg font-semibold {iconColor}">{t('procedure_point')}</span>
          </div>

          <div class="mt-4 space-y-2">
            <div class="text-2xl font-bold text-foreground">
              {POINT_LABELS[latestPoint.type]}
            </div>
            <div class="text-base text-muted-foreground">
              {t('procedure_motion_proposed_by_name', { name: proposerDel?.name ?? latestPoint.proposedBySeatId })}
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex justify-center">
          <Button
            size="lg"
            class="min-w-[200px] gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            onclick={handleEnd}
          >
            {t('procedure_end_point')}
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
