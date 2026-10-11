<script lang="ts">
  import { onMount } from 'svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import { CircleAlert, Inbox, RefreshCw, ScrollText, Send } from '@lucide/svelte'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import {
    CloudDirectiveError,
    cloudApiBaseUrl,
    listDirectiveRevisions,
    listDirectiveTargets,
    listDirectiveWorkflow,
    listMyDirectives,
    resubmitCloudDirective,
    submitCloudDirective,
    transitionCloudDirective,
    type CloudDirective,
    type CloudDirectiveRevision
  } from '$lib/classes/clients/cloud-directive-client'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as Card from '$lib/components/ui/card'
  import * as Field from '$lib/components/ui/field'
  import * as Select from '$lib/components/ui/select'
  import * as Alert from '$lib/components/ui/alert'
  import * as Empty from '$lib/components/ui/empty'
  import { Badge } from '$lib/components/ui/badge'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { Spinner } from '$lib/components/ui/spinner'

  let mine = $state<CloudDirective[]>([])
  let workflow = $state<CloudDirective[]>([])
  let targets = $state<Array<{ id: string; name: string }>>([])
  let title = $state('')
  let content = $state('')
  let targetCommitteeId = $state('')
  let editingId = $state<string | null>(null)
  let submissionKey = $state<string>(crypto.randomUUID())
  let noteById = $state<Record<string, string>>({})
  let revisions = $state<Record<string, CloudDirectiveRevision[]>>({})
  let showHistory = $state<Record<string, boolean>>({})
  let loading = $state(true)
  let busy = $state(false)
  let error = $state('')
  let draftReady = $state(false)
  let draftError = $state('')
  let otherSeatDraft = $state<{ seatId: string; title: string; content: string } | null>(null)
  let loadSequence = 0
  let targetsLoaded = false

  const session = $derived(cloudSession.session?.result)
  const token = $derived(session?.token ?? '')
  const identity = $derived(session?.identity)
  const canSubmit = $derived(cloudSession.hasCapability('submit_directive'))
  const canProcess = $derived(cloudSession.hasCapability('process_directive'))
  const draftKey = $derived(
    identity
      ? `veto.directive-draft:${cloudApiBaseUrl}:${identity.conferenceId}:${identity.seatId}`
      : ''
  )
  const draftPrefix = $derived(
    identity ? `veto.directive-draft:${cloudApiBaseUrl}:${identity.conferenceId}:` : ''
  )

  const statusLabels: Record<CloudDirective['status'], string> = {
    submitted: '待认领',
    processing: '处理中',
    approved: '已批准',
    rejected: '已驳回',
    cancelled: '已取消'
  }
  const statusBadgeVariants: Record<
    CloudDirective['status'],
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    submitted: 'secondary',
    processing: 'default',
    approved: 'default',
    rejected: 'destructive',
    cancelled: 'outline'
  }

  function changeDraft(): void {
    if (!editingId) submissionKey = crypto.randomUUID()
  }

  async function load(silent = false): Promise<void> {
    if (!token || busy) {
      loading = false
      return
    }
    const sequence = ++loadSequence
    if (!silent) loading = true
    try {
      const [own, inbox, targetList] = await Promise.all([
        canSubmit ? listMyDirectives(token) : Promise.resolve(null),
        canProcess ? listDirectiveWorkflow(token) : Promise.resolve(null),
        canSubmit ? (targetsLoaded ? Promise.resolve({ targets }) : listDirectiveTargets(token)) : Promise.resolve(null)
      ])
      if (sequence !== loadSequence || token !== cloudSession.session?.result.token) return
      mine = own?.directives ?? []
      workflow = inbox?.directives ?? []
      targets = targetList?.targets ?? []
      if (targetList) targetsLoaded = true
      if (!targetCommitteeId && targets.length === 1) targetCommitteeId = targets[0].id
      error = ''
    } catch (caught) {
      if (sequence !== loadSequence) return
      error = caught instanceof CloudDirectiveError ? caught.message : '加载指令失败'
    } finally {
      if (sequence === loadSequence) loading = false
    }
  }

  async function send(): Promise<void> {
    if (!token || !canSubmit || !title.trim() || !content.trim() || !targetCommitteeId || busy)
      return
    busy = true
    try {
      const input = { title: title.trim(), content: content.trim(), targetCommitteeId }
      if (editingId) await resubmitCloudDirective(token, editingId, input)
      else await submitCloudDirective(token, input, submissionKey)
      title = ''
      content = ''
      targetCommitteeId = ''
      editingId = null
      submissionKey = crypto.randomUUID()
      if (draftKey) localStorage.removeItem(draftKey)
      busy = false
      await load(true)
    } catch (caught) {
      error = caught instanceof CloudDirectiveError ? caught.message : '提交指令失败'
    } finally {
      busy = false
    }
  }

  function revise(item: CloudDirective): void {
    editingId = item.id
    title = item.title
    content = item.content
    targetCommitteeId = item.targetCommitteeId
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function transition(
    item: CloudDirective,
    action: 'claim' | 'approve' | 'reject' | 'cancel'
  ): Promise<void> {
    if (!token || busy) return
    const note = noteById[item.id]?.trim() ?? ''
    if ((action === 'approve' || action === 'reject') && (!note || note.length > 4000)) {
      error = '批准或驳回必须填写处理说明（最多 4000 字）'
      return
    }
    busy = true
    try {
      await transitionCloudDirective(token, item.id, action, note)
      noteById[item.id] = ''
      busy = false
      await load(true)
    } catch (caught) {
      error = caught instanceof CloudDirectiveError ? caught.message : '处理指令失败'
    } finally {
      busy = false
    }
  }

  async function toggleHistory(item: CloudDirective): Promise<void> {
    if (showHistory[item.id]) {
      showHistory[item.id] = false
      return
    }
    try {
      revisions[item.id] = (await listDirectiveRevisions(token, item.id)).revisions
      showHistory[item.id] = true
    } catch (caught) {
      error = caught instanceof CloudDirectiveError ? caught.message : '读取修改记录失败'
    }
  }

  onMount(() => {
    if (draftKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null') as Record<
          string,
          unknown
        > | null
        if (saved) {
          title = typeof saved.title === 'string' ? saved.title : ''
          content = typeof saved.content === 'string' ? saved.content : ''
          targetCommitteeId =
            typeof saved.targetCommitteeId === 'string' ? saved.targetCommitteeId : ''
          editingId = typeof saved.editingId === 'string' ? saved.editingId : null
          submissionKey =
            typeof saved.submissionKey === 'string' ? saved.submissionKey : crypto.randomUUID()
        }
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index)
          if (!key?.startsWith(draftPrefix) || key === draftKey) continue
          const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<
            string,
            unknown
          > | null
          if (value && typeof value.content === 'string' && value.content) {
            otherSeatDraft = {
              seatId: key.slice(draftPrefix.length),
              title: typeof value.title === 'string' ? value.title : '',
              content: value.content
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
    const unsubscribe = fileNotifications.subscribe(['directives'], () => load(true))
    return unsubscribe
  })

  $effect(() => {
    if (!draftReady || !draftKey) return
    try {
      if (title || content || editingId) {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            title,
            content,
            targetCommitteeId,
            editingId,
            submissionKey
          })
        )
      } else {
        localStorage.removeItem(draftKey)
      }
      draftError = ''
    } catch {
      draftError = '本地草稿保存失败，请复制正文备份'
    }
  })
</script>

{#snippet cardSkeleton()}
  <Card.Root>
    <Card.Content class="flex flex-col gap-3">
      <Skeleton class="h-5 w-1/3" />
      <Skeleton class="h-4 w-1/2" />
      <Skeleton class="h-16 w-full" />
    </Card.Content>
  </Card.Root>
{/snippet}

{#snippet listEmpty(heading: string, description: string)}
  <Empty.Root class="py-8">
    <Empty.Header>
      <Empty.Media variant="icon"><Inbox /></Empty.Media>
      <Empty.Title>{heading}</Empty.Title>
      <Empty.Description>{description}</Empty.Description>
    </Empty.Header>
  </Empty.Root>
{/snippet}

<svelte:head><title>指令 · Veto</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-2 text-xl font-semibold"><ScrollText />指令</h1>
      <p class="mt-1 text-sm text-muted-foreground">向指定委员会提交请求并跟踪处理结果</p>
    </div>
    <Button variant="outline" size="sm" onclick={() => void load()} disabled={loading || busy}>
      {#if loading}<Spinner data-icon="inline-start" />{:else}<RefreshCw
          data-icon="inline-start"
        />{/if}
      刷新
    </Button>
  </header>

  {#if !token}
    <Empty.Root class="border bg-card/45 py-10">
      <Empty.Header>
        <Empty.Media variant="icon"><ScrollText /></Empty.Media>
        <Empty.Title>指令仅在 Cloud Conference 中提供</Empty.Title>
        <Empty.Description>加入云端会议后即可提交和跟踪指令。</Empty.Description>
      </Empty.Header>
    </Empty.Root>
  {:else}
    {#if error}
      <Alert.Root variant="destructive">
        <CircleAlert />
        <Alert.Description>{error}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if draftError}
      <Alert.Root variant="destructive">
        <CircleAlert />
        <Alert.Description>{draftError}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if otherSeatDraft}
      <Card.Root>
        <Card.Header>
          <Card.Title>其他席位的本地草稿</Card.Title>
          <Card.Description>属于席位 {otherSeatDraft.seatId}，仅供查看和复制。</Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-2">
          <p class="font-medium">{otherSeatDraft.title}</p>
          <Textarea readonly rows={4} value={otherSeatDraft.content} />
        </Card.Content>
      </Card.Root>
    {/if}

    {#if canSubmit}
      <Card.Root>
        <Card.Header>
          <Card.Title>{editingId ? '修改被驳回的指令' : '提交指令'}</Card.Title>
          <Card.Description>草稿只保存在本机；提交成功后由云端服务保存。</Card.Description>
        </Card.Header>
        <Card.Content>
          <Field.FieldGroup>
            <Field.Field>
              <Field.FieldLabel for="directive-title">标题</Field.FieldLabel>
              <Input
                id="directive-title"
                maxlength={200}
                bind:value={title}
                oninput={changeDraft}
              />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="directive-target">目标委员会</Field.FieldLabel>
              <Select.Select
                type="single"
                bind:value={targetCommitteeId}
                onValueChange={() => changeDraft()}
              >
                <Select.SelectTrigger id="directive-target" class="w-full">
                  {targets.find((target) => target.id === targetCommitteeId)?.name ??
                    '请选择目标委员会'}
                </Select.SelectTrigger>
                <Select.SelectContent>
                  {#each targets as target (target.id)}
                    <Select.SelectItem value={target.id} label={target.name} />
                  {/each}
                </Select.SelectContent>
              </Select.Select>
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="directive-content">正文</Field.FieldLabel>
              <Textarea
                id="directive-content"
                rows={8}
                maxlength={20000}
                bind:value={content}
                oninput={changeDraft}
                placeholder="说明要执行的行动、资源和预期结果…"
              />
            </Field.Field>
          </Field.FieldGroup>
        </Card.Content>
        <Card.Footer class="flex justify-end gap-2">
          {#if editingId}
            <Button
              variant="outline"
              disabled={busy}
              onclick={() => {
                editingId = null
                title = ''
                content = ''
                targetCommitteeId = ''
                submissionKey = crypto.randomUUID()
              }}
            >
              退出修改
            </Button>
          {/if}
          <Button
            disabled={!title.trim() || !content.trim() || !targetCommitteeId || busy}
            onclick={() => void send()}
          >
            {#if busy}<Spinner data-icon="inline-start" />{:else}<Send
                data-icon="inline-start"
              />{/if}
            {busy ? '提交中…' : editingId ? '修改并重交' : '提交指令'}
          </Button>
        </Card.Footer>
      </Card.Root>
    {/if}

    {#if canProcess}
      <section class="flex flex-col gap-3">
        <h2 class="font-semibold">
          待处理指令 <span class="text-xs text-muted-foreground">{workflow.length}</span>
        </h2>
        {#if loading && workflow.length === 0}
          {#each Array(2) as _, index (index)}{@render cardSkeleton()}{/each}
        {:else if workflow.length === 0}
          {@render listEmpty('暂无待处理指令', '新的指令提交后会出现在这里。')}
        {/if}
        {#each workflow as item (item.id)}
          <Card.Root>
            <Card.Header>
              <div class="flex justify-between gap-3">
                <div>
                  <Card.Title>{item.title}</Card.Title>
                  <Card.Description>
                    {item.author.committeeName} · {item.author.seatName} · 第 {item.revision} 版
                  </Card.Description>
                </div>
                <Badge variant={statusBadgeVariants[item.status]}>
                  {statusLabels[item.status]}
                </Badge>
              </div>
            </Card.Header>
            <Card.Content class="flex flex-col gap-4">
              <p class="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
              {#if item.status === 'submitted'}
                <Button size="sm" disabled={busy} onclick={() => void transition(item, 'claim')}>
                  认领处理
                </Button>
              {:else if item.claimedByMe}
                <div class="flex flex-col gap-2 border-t pt-4">
                  <Field.FieldGroup>
                    <Field.Field>
                      <Field.FieldLabel for={`note-${item.id}`}>处理说明</Field.FieldLabel>
                      <Textarea
                        id={`note-${item.id}`}
                        rows={3}
                        maxlength={4000}
                        bind:value={noteById[item.id]}
                      />
                    </Field.Field>
                  </Field.FieldGroup>
                  <div class="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !noteById[item.id]?.trim()}
                      onclick={() => void transition(item, 'reject')}
                    >
                      驳回
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || !noteById[item.id]?.trim()}
                      onclick={() => void transition(item, 'approve')}
                    >
                      批准
                    </Button>
                  </div>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </section>
    {/if}

    {#if canSubmit}
      <section class="flex flex-col gap-3">
        <h2 class="font-semibold">
          我的指令 <span class="text-xs text-muted-foreground">{mine.length}</span>
        </h2>
        {#if loading && mine.length === 0}
          {#each Array(2) as _, index (index)}{@render cardSkeleton()}{/each}
        {:else if mine.length === 0}
          {@render listEmpty('尚未提交指令', '使用上方表单提交你的第一条指令。')}
        {/if}
        {#each mine as item (item.id)}
          <Card.Root>
            <Card.Header>
              <div class="flex justify-between gap-3">
                <div>
                  <Card.Title>{item.title}</Card.Title>
                  <Card.Description>
                    发往 {item.targetCommitteeName} · 第 {item.revision} 版 · {new Date(
                      item.createdAt
                    ).toLocaleString('zh-CN')}
                  </Card.Description>
                </div>
                <Badge variant={statusBadgeVariants[item.status]}>
                  {statusLabels[item.status]}
                </Badge>
              </div>
            </Card.Header>
            <Card.Content class="flex flex-col gap-3">
              <p class="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
              {#if item.processingNote}
                <p class="rounded-md bg-muted p-3 text-sm">处理说明：{item.processingNote}</p>
              {/if}
              <div class="flex flex-wrap gap-2">
                {#if item.status === 'submitted'}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onclick={() => void transition(item, 'cancel')}
                  >
                    取消指令
                  </Button>
                {/if}
                {#if item.status === 'rejected'}
                  <Button variant="outline" size="sm" disabled={busy} onclick={() => revise(item)}>
                    修改重交
                  </Button>
                {/if}
                <Button variant="ghost" size="sm" onclick={() => void toggleHistory(item)}>
                  {showHistory[item.id] ? '收起修改记录' : '查看修改记录'}
                </Button>
              </div>
              {#if showHistory[item.id]}
                <div class="flex flex-col gap-2 border-t pt-3">
                  {#each revisions[item.id] ?? [] as revision (revision.revision)}
                    <div class="rounded-md bg-muted/60 p-3 text-sm">
                      <p class="font-medium">第 {revision.revision} 版 · {revision.title}</p>
                      <p class="mt-1 whitespace-pre-wrap">{revision.content}</p>
                      {#if revision.decisionNote}
                        <p class="mt-2 text-muted-foreground">
                          {revision.decision === 'rejected'
                            ? '驳回'
                            : '批准'}说明：{revision.decisionNote}
                        </p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </section>
    {/if}
  {/if}
</div>
