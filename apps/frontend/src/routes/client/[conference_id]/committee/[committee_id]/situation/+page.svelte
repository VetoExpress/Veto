<script lang="ts">
  import { onMount } from 'svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import { Activity, Clock3, Pause, Play, RefreshCw, Send, SkipForward } from '@lucide/svelte'
  import DOMPurify from 'dompurify'
  import { marked } from 'marked'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import {
    CloudSituationError,
    cloudApiBaseUrl,
    controlCloudTimeline,
    getCloudTimeline,
    listCloudSituations,
    publishCloudSituation,
    withdrawCloudSituation
  } from '$lib/classes/clients/cloud-situation-client'
  import type {
    CloudSituation as SituationUpdate,
    CloudTimeline as TimelineProjection
  } from '$lib/classes/clients/cloud-situation-client'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as Card from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'

  let situations = $state<SituationUpdate[]>([])
  let timeline = $state<TimelineProjection | null>(null)
  let timezone = $state('Asia/Shanghai')
  let content = $state('')
  let manualTime = $state('')
  let ratioInput = $state('')
  let jumpTime = $state('')
  let loading = $state(true)
  let submitting = $state(false)
  let controlling = $state(false)
  let withdrawingId = $state<string | null>(null)
  let withdrawing = $state(false)
  let withdrawalReason = $state('')
  let draftReady = $state(false)
  let draftError = $state('')
  let otherSeatDraft = $state<{ seatId: string; content: string; manualTime: string } | null>(null)
  let error = $state('')
  let clockNow = $state(Date.now())
  let timelineReceivedAt = $state(Date.now())
  let loadSequence = 0

  const token = $derived(cloudSession.session?.result.token ?? '')
  const identity = $derived(cloudSession.session?.result.identity)
  const canView = $derived(cloudSession.hasCapability('view_situation'))
  const canPublish = $derived(
    cloudSession.session?.result.committeeType === 'ipc' &&
      cloudSession.hasCapability('publish_situation')
  )
  const canWithdraw = $derived(cloudSession.hasCapability('withdraw_situation'))
  const canControl = $derived(
    cloudSession.session?.result.committeeType === 'ipc' &&
      cloudSession.hasCapability('control_timeline')
  )
  const canSeeTimeline = $derived(canView || canPublish || canControl)
  const draftKey = $derived(
    identity
      ? `veto.situation-draft:${cloudApiBaseUrl}:${identity.conferenceId}:${identity.seatId}`
      : ''
  )
  const draftPrefix = $derived(
    identity ? `veto.situation-draft:${cloudApiBaseUrl}:${identity.conferenceId}:` : ''
  )
  const currentTimelineTime = $derived(
    timeline
      ? timeline.currentTime +
          (timeline.paused ? 0 : (clockNow - timelineReceivedAt) * timeline.ratio)
      : null
  )

  function formatTime(value: number): string {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(value)
  }

  function parseChinaTime(value: string): number {
    return Date.parse(`${value}:00+08:00`)
  }

  function validChinaTime(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false
    const timestamp = parseChinaTime(value)
    return (
      Number.isSafeInteger(timestamp) &&
      new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) === value
    )
  }

  function markdown(value: string): string {
    return DOMPurify.sanitize(marked.parse(value, { async: false }) as string)
  }

  async function load(silent = false): Promise<void> {
    if (controlling) return
    if (!token) {
      loading = false
      return
    }
    const sequence = ++loadSequence
    if (!silent) loading = true
    try {
      const [situationResult, timelineResult] = await Promise.all([
        canView ? listCloudSituations(token) : Promise.resolve(null),
        canSeeTimeline ? getCloudTimeline(token) : Promise.resolve(null)
      ])
      if (sequence !== loadSequence || token !== cloudSession.session?.result.token) return
      situations = situationResult?.situations ?? []
      timezone = situationResult?.timezone ?? timelineResult?.timezone ?? 'Asia/Shanghai'
      timeline = timelineResult?.timeline ?? null
      timelineReceivedAt = Date.now()
      error = ''
    } catch (caught) {
      if (sequence !== loadSequence) return
      error = caught instanceof CloudSituationError ? caught.message : '加载局势失败'
    } finally {
      if (sequence === loadSequence) loading = false
    }
  }

  async function publish(): Promise<void> {
    if (!token || !canPublish || !content.trim() || submitting) return
    if (!timeline && !validChinaTime(manualTime)) {
      error = '请填写有效的内容时间（UTC+8）'
      return
    }
    submitting = true
    try {
      await publishCloudSituation(token, {
        content: content.trim(),
        ...(!timeline ? { contentTime: parseChinaTime(manualTime) } : {})
      })
      content = ''
      manualTime = ''
      if (draftKey) localStorage.removeItem(draftKey)
      await load(true)
    } catch (caught) {
      error = caught instanceof CloudSituationError ? caught.message : '发布局势失败'
    } finally {
      submitting = false
    }
  }

  async function withdraw(item: SituationUpdate): Promise<void> {
    const reason = withdrawalReason.trim()
    if (
      !token ||
      !canWithdraw ||
      !reason ||
      reason.length > 500 ||
      withdrawingId !== item.id ||
      withdrawing
    )
      return
    withdrawing = true
    try {
      await withdrawCloudSituation(token, item.id, reason)
      withdrawingId = null
      withdrawalReason = ''
      await load(true)
    } catch (caught) {
      error = caught instanceof CloudSituationError ? caught.message : '撤回局势失败'
    } finally {
      withdrawing = false
    }
  }

  async function control(
    input:
      | { action: 'pause' | 'resume' }
      | { action: 'set_ratio'; ratio: number }
      | { action: 'jump'; contentTime: number }
  ): Promise<void> {
    if (!token || !canControl || !timeline || controlling) return
    ++loadSequence
    loading = false
    controlling = true
    let conflictMessage = ''
    try {
      const result = await controlCloudTimeline(token, input)
      timeline = result.timeline
      timelineReceivedAt = Date.now()
      ratioInput = ''
      jumpTime = ''
      error = ''
    } catch (caught) {
      if (caught instanceof CloudSituationError && caught.status === 409)
        conflictMessage = caught.message
      error = caught instanceof CloudSituationError ? caught.message : '控制时间线失败'
    } finally {
      controlling = false
    }
    if (conflictMessage) {
      await load(true)
      error = conflictMessage
    }
  }

  onMount(() => {
    if (draftKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null') as unknown
        if (
          saved &&
          typeof saved === 'object' &&
          'content' in saved &&
          typeof saved.content === 'string'
        ) {
          content = saved.content
          if ('manualTime' in saved && typeof saved.manualTime === 'string')
            manualTime = saved.manualTime
        }
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index)
          if (!key?.startsWith(draftPrefix) || key === draftKey) continue
          const value = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
          if (
            value &&
            typeof value === 'object' &&
            'content' in value &&
            typeof value.content === 'string'
          ) {
            otherSeatDraft = {
              seatId: key.slice(draftPrefix.length),
              content: value.content,
              manualTime:
                'manualTime' in value && typeof value.manualTime === 'string'
                  ? value.manualTime
                  : ''
            }
            break
          }
        }
      } catch {
        draftError = '无法读取本地草稿'
      }
    }
    draftReady = true
    void load()
    const clock = window.setInterval(() => (clockNow = Date.now()), 1000)
    const unsubscribe = fileNotifications.subscribe(['situations', 'timeline'], () => load(true))
    return () => {
      window.clearInterval(clock)
      unsubscribe()
    }
  })

  $effect(() => {
    if (!draftReady || !draftKey) return
    try {
      if (content || manualTime) {
        localStorage.setItem(draftKey, JSON.stringify({ content, manualTime }))
      } else {
        localStorage.removeItem(draftKey)
      }
      draftError = ''
    } catch {
      draftError = '本地草稿保存失败，请先复制正文备份'
    }
  })
</script>

<svelte:head><title>局势 · Veto</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-2 text-xl font-semibold"><Activity />局势</h1>
      <p class="mt-1 text-sm text-muted-foreground">大会统一局势时间线</p>
    </div>
    <Button variant="outline" size="sm" onclick={() => void load()} disabled={loading}>
      <RefreshCw class={loading ? 'animate-spin' : ''} />刷新
    </Button>
  </header>

  {#if !token}
    <Card.Root>
      <Card.Content class="py-10 text-center text-muted-foreground">
        局势仅在 Cloud Conference 中提供。
      </Card.Content>
    </Card.Root>
  {:else}
    {#if error}<p class="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>{/if}
    {#if draftError}<p class="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {draftError}
      </p>{/if}
    {#if otherSeatDraft}
      <Card.Root>
        <Card.Header>
          <Card.Title>其他席位的本地草稿</Card.Title>
          <Card.Description>
            此草稿属于席位 {otherSeatDraft.seatId}，仅供查看和复制。请用原席位重新认证后提交。
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#if otherSeatDraft.manualTime}<p class="text-sm text-muted-foreground">
              内容时间：{otherSeatDraft.manualTime}（UTC+8）
            </p>{/if}
          <Textarea readonly rows={6} value={otherSeatDraft.content} />
        </Card.Content>
      </Card.Root>
    {/if}

    {#if timeline}
      <Card.Root>
        <Card.Header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Card.Title class="flex items-center gap-2"><Clock3 />{timeline.name}</Card.Title>
              <Card.Description>
                {timeline.paused ? '已暂停' : `${timeline.ratio}x 运行中`}
              </Card.Description>
            </div>
            <Badge variant={timeline.paused ? 'secondary' : 'default'}>
              {timeline.paused ? '暂停' : '运行'}
            </Badge>
          </div>
        </Card.Header>
        <Card.Content class="space-y-4">
          <p class="font-mono text-3xl font-semibold">
            {formatTime(currentTimelineTime ?? timeline.currentTime)}
          </p>
          {#if canControl}
            <div class="flex flex-wrap items-end gap-2 border-t pt-4">
              <Button
                disabled={controlling}
                onclick={() => void control({ action: timeline?.paused ? 'resume' : 'pause' })}
              >
                {#if timeline.paused}<Play />启动{:else}<Pause />暂停{/if}
              </Button>
              <div class="space-y-1">
                <Label for="timeline-ratio">正整数倍率</Label>
                <div class="flex gap-2">
                  <Input
                    id="timeline-ratio"
                    class="w-32"
                    type="number"
                    min="1"
                    step="1"
                    bind:value={ratioInput}
                  />
                  <Button
                    variant="outline"
                    disabled={!Number.isSafeInteger(Number(ratioInput)) ||
                      Number(ratioInput) < 1 ||
                      controlling}
                    onclick={() => void control({ action: 'set_ratio', ratio: Number(ratioInput) })}
                  >
                    应用
                  </Button>
                </div>
              </div>
              <div class="space-y-1">
                <Label for="timeline-jump">跳转时间（UTC+8）</Label>
                <div class="flex gap-2">
                  <Input id="timeline-jump" type="datetime-local" bind:value={jumpTime} />
                  <Button
                    variant="outline"
                    disabled={!validChinaTime(jumpTime) || controlling}
                    onclick={() =>
                      void control({ action: 'jump', contentTime: parseChinaTime(jumpTime) })}
                  >
                    <SkipForward />跳转
                  </Button>
                </div>
              </div>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}

    {#if canPublish}
      <Card.Root>
        <Card.Header>
          <Card.Title>发布局势更新</Card.Title><Card.Description>
            正文支持 Markdown，草稿保存在本机；发布后不可修改。
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          {#if !timeline}
            <div class="space-y-1.5">
              <Label for="content-time">内容时间（UTC+8）</Label><Input
                id="content-time"
                type="datetime-local"
                bind:value={manualTime}
              />
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">内容时间将取发布瞬间的大会时间线时间。</p>
          {/if}
          <div class="space-y-1.5">
            <Label for="situation-content">正文</Label><Textarea
              id="situation-content"
              rows={8}
              maxlength={20000}
              bind:value={content}
              placeholder="输入 Markdown 正文…"
            />
          </div>
          <div class="flex justify-end">
            <Button
              disabled={!content.trim() ||
                content.trim().length > 20000 ||
                (!timeline && !validChinaTime(manualTime)) ||
                submitting ||
                loading}
              onclick={() => void publish()}
            >
              <Send />{submitting ? '发布中…' : '立即发布'}
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    {#if canView}<section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">已发布局势</h2>
          <span class="text-xs text-muted-foreground">{situations.length} 条</span>
        </div>
        {#if loading}
          <p class="py-10 text-center text-sm text-muted-foreground">正在加载…</p>
        {:else if situations.length === 0}
          <Card.Root>
            <Card.Content class="py-10 text-center text-muted-foreground">
              暂无局势更新
            </Card.Content>
          </Card.Root>
        {:else}
          {#each situations as item (item.id)}
            <Card.Root>
              <Card.Header>
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <Card.Title class="font-mono text-base">
                      {formatTime(item.contentTime)}
                    </Card.Title><Card.Description>
                      {item.author?.committeeName} · {item.author?.seatName}{item.author?.role
                        ? ` · ${item.author.role}`
                        : ''}
                    </Card.Description>
                  </div>
                  {#if canWithdraw}<Button
                      variant="destructive"
                      size="sm"
                      disabled={withdrawingId !== null || withdrawing}
                      onclick={() => {
                        withdrawingId = item.id
                        withdrawalReason = ''
                      }}
                    >
                      撤回
                    </Button>{/if}
                </div>
              </Card.Header>
              <Card.Content class="space-y-4">
                <article class="markdown-body text-sm leading-7">
                  {@html markdown(item.content)}
                </article>
                {#if withdrawingId === item.id}
                  <div class="space-y-2 border-t pt-4">
                    <Label for={`withdraw-${item.id}`}>撤回原因（必填，最多 500 字）</Label>
                    <Textarea
                      id={`withdraw-${item.id}`}
                      rows={3}
                      maxlength={500}
                      bind:value={withdrawalReason}
                    />
                    <div class="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={withdrawing}
                        onclick={() => {
                          withdrawingId = null
                          withdrawalReason = ''
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!withdrawalReason.trim() ||
                          withdrawalReason.trim().length > 500 ||
                          withdrawing}
                        onclick={() => void withdraw(item)}
                      >
                        {withdrawing ? '撤回中…' : '确认撤回'}
                      </Button>
                    </div>
                  </div>
                {/if}
              </Card.Content>
            </Card.Root>
          {/each}
        {/if}
      </section>{/if}
  {/if}
</div>

<style>
  :global(.markdown-body p) {
    margin: 0.5rem 0;
  }
  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  :global(.markdown-body ul) {
    list-style: disc;
  }
  :global(.markdown-body ol) {
    list-style: decimal;
  }
  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3) {
    margin: 1rem 0 0.5rem;
    font-weight: 650;
  }
  :global(.markdown-body code) {
    border-radius: 0.25rem;
    background: var(--muted);
    padding: 0.1rem 0.3rem;
  }
</style>
