<script lang="ts">
  import { onMount } from 'svelte'
  import { CircleAlert, Download, FileUp, FolderOpen, RefreshCw } from '@lucide/svelte'
  import { cloudSession } from '$lib/classes/stores/cloud/cloud-session-store.svelte'
  import { fileNotifications } from '$lib/classes/stores/cloud/file-notification-store.svelte'
  import {
    CloudFileError, cancelCloudFile, decideFileVisibility, downloadCloudFile, listCloudFiles,
    listFileWorkflow, listMyCloudFiles, listVisibilityWorkflow,
    requestFileVisibility, reviewCloudFile, uploadCloudFile, withdrawCloudFile,
    type FileVisibility, type FileVisibilityRequest
  } from '$lib/classes/clients/cloud-file-client'
  import type { FileContent } from '$lib/classes/clients/cloud-file-client'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Card from '$lib/components/ui/card'
  import * as Select from '$lib/components/ui/select'
  import * as Table from '$lib/components/ui/table'
  import * as Alert from '$lib/components/ui/alert'
  import * as Empty from '$lib/components/ui/empty'
  import { Badge } from '$lib/components/ui/badge'

  type Tab = 'published' | 'mine' | 'workflow'
  let tab = $state<Tab>('published')
  let published = $state<FileContent[]>([])
  let mine = $state<FileContent[]>([])
  let workflow = $state<FileContent[]>([])
  let visibilityRequests = $state<FileVisibilityRequest[]>([])
  let selectedFile = $state<globalThis.File | null>(null)
  let title = $state('')
  let selectedType = $state('会议材料')
  let customType = $state('')
  let visibility = $state<FileVisibility>('committee')
  let replacesFileId = $state<string | null>(null)
  let filterType = $state('')
  let selectedId = $state<string | null>(null)
  let note = $state('')
  let requestNotes = $state<Record<string, string>>({})
  let approvedVisibility = $state<FileVisibility>('committee')
  let loading = $state(false)
  let busy = $state(false)
  let error = $state('')
  let notice = $state('')
  let loadSequence = 0
  const customTypeValue = '__custom__'

  const token = $derived(cloudSession.session?.result.token ?? '')
  const canView = $derived(cloudSession.hasCapability('view_files'))
  const canSend = $derived(cloudSession.hasCapability('send_files'))
  const canReview = $derived(cloudSession.hasCapability('review_files'))
  const canWithdraw = $derived(cloudSession.hasCapability('withdraw_files'))
  const ownCommitteeId = $derived(cloudSession.session?.result.identity.committeeId ?? '')
  const fileType = $derived(selectedType === customTypeValue ? customType : selectedType)
  const fileTypes = $derived([...new Set(['会议材料', ...published.map((item) => item.fileType),
    ...mine.map((item) => item.fileType), ...workflow.map((item) => item.fileType)])]
    .sort((a, b) => a.localeCompare(b, 'zh-CN')))
  const currentList = $derived(tab === 'published' ? published : tab === 'mine' ? mine : workflow)
  const visibleFiles = $derived(currentList.filter((item) => !filterType || item.fileType === filterType))

  function message(caught: unknown, fallback: string): string {
    return caught instanceof CloudFileError ? caught.message : fallback
  }

  function statusLabel(status: FileContent['status']): string {
    return ({ submitted: '待审核', published: '已发布', rejected: '已打回',
      cancelled: '已取消', withdrawn: '已撤回' })[status]
  }

  function visibilityLabel(value: FileVisibility): string {
    return value === 'conference' ? '全大会' : '本委员会'
  }

  async function load(silent = false): Promise<void> {
    if (!token) return
    const sequence = ++loadSequence
    if (!silent) loading = true
    try {
      const [publicResult, mineResult, workflowResult, visibilityResult] = await Promise.all([
        canView ? listCloudFiles(token) : Promise.resolve(null),
        canSend ? listMyCloudFiles(token) : Promise.resolve(null),
        canReview ? listFileWorkflow(token) : Promise.resolve(null),
        canReview ? listVisibilityWorkflow(token) : Promise.resolve(null)
      ])
      if (sequence !== loadSequence || token !== cloudSession.session?.result.token) return
      published = publicResult?.files ?? []
      mine = mineResult?.files ?? []
      workflow = workflowResult?.files ?? []
      visibilityRequests = visibilityResult?.requests ?? []
      error = ''
    } catch (caught) {
      if (sequence === loadSequence) error = message(caught, '加载文件失败')
    } finally {
      if (sequence === loadSequence) loading = false
    }
  }

  async function send(): Promise<void> {
    if (!token || !canSend || !selectedFile || busy) return
    if (!title.trim() || !fileType.trim()) { error = '请填写标题和文件类型'; return }
    if (selectedFile.size === 0 || selectedFile.size > 20 * 1024 * 1024) {
      error = '请选择不超过 20 MiB 的非空文件'
      return
    }
    busy = true
    try {
      await uploadCloudFile(token, selectedFile, {
        title: title.trim(), fileType: fileType.trim(), visibility,
        ...(replacesFileId ? { replacesFileId } : {})
      })
      selectedFile = null
      title = ''
      replacesFileId = null
      const input = document.getElementById('file-upload') as HTMLInputElement | null
      if (input) input.value = ''
      tab = 'mine'
      notice = '文件已提交主席团审核'
      await load(true)
    } catch (caught) {
      error = message(caught, '提交文件失败')
    } finally { busy = false }
  }

  function prepareResubmit(item: FileContent): void {
    replacesFileId = item.id
    title = item.title
    selectedType = fileTypes.includes(item.fileType) ? item.fileType : customTypeValue
    if (selectedType === customTypeValue) customType = item.fileType
    visibility = item.requestedVisibility
    notice = '请选择修订后的本地文件，再重新提交审核'
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function mutate(operation: () => Promise<unknown>, fallback: string, success: string): Promise<void> {
    if (busy) return
    busy = true
    try {
      await operation()
      selectedId = null
      note = ''
      notice = success
      await load(true)
    } catch (caught) {
      error = message(caught, fallback)
      if (caught instanceof CloudFileError && caught.status === 409) await load(true)
    } finally { busy = false }
  }

  function select(item: FileContent): void {
    selectedId = selectedId === item.id ? null : item.id
    note = ''
    approvedVisibility = item.requestedVisibility
  }

  onMount(() => {
    if (!canView && canSend) tab = 'mine'
    else if (!canView && canReview) tab = 'workflow'
    void load()
    const unsubscribe = fileNotifications.subscribe(['files'], () => load(true))
    return unsubscribe
  })

</script>

<svelte:head><title>文件 · Veto</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-2 text-xl font-semibold"><FolderOpen />文件</h1>
      <p class="mt-1 text-sm text-muted-foreground">文件由主席团审核；公开后按可视范围提供下载。</p>
    </div>
    {#if token}<Button variant="outline" size="sm" onclick={() => void load()} disabled={loading || busy}><RefreshCw data-icon="inline-start" />刷新</Button>{/if}
  </header>

  {#if !token}
    <Empty.Root class="border bg-card/45 py-10"><Empty.Header>
      <Empty.Media variant="icon"><FolderOpen /></Empty.Media>
      <Empty.Title>文件仅在云端大会中提供</Empty.Title>
      <Empty.Description>加入云端大会后即可使用文件功能。</Empty.Description>
    </Empty.Header></Empty.Root>
  {:else}
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    {#if notice}<p class="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</p>{/if}

    {#if canSend}
      <Card.Root>
        <Card.Header>
          <Card.Title>{replacesFileId ? '重新提交文件' : '提交文件'}</Card.Title>
          <Card.Description>上传后由主席团审核。打回的文件在云端删除内容，并保留原因记录。</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <Label for="file-upload">选择本地文件（最大 20 MiB）</Label>
            <Input id="file-upload" type="file" class="mt-2" disabled={busy}
              onchange={(event) => {
                selectedFile = event.currentTarget.files?.[0] ?? null
                if (selectedFile && !title) title = selectedFile.name.replace(/\.[^.]+$/, '')
              }} />
          </div>
          <div><Label for="file-title">标题</Label><Input id="file-title" class="mt-2" maxlength={200} bind:value={title} /></div>
          <div class="flex flex-col gap-2">
            <Label for="file-type">文件类型</Label>
            <Select.Root type="single" bind:value={selectedType} items={[...fileTypes.map((value) => ({ value, label: value })), { value: customTypeValue, label: '自定义类型…' }]}>
              <Select.Trigger id="file-type" class="w-full"><Select.Value placeholder="选择文件类型" /></Select.Trigger>
              <Select.Content><Select.Group>
                {#each fileTypes as type (type)}<Select.Item value={type}>{type}</Select.Item>{/each}
                <Select.Item value={customTypeValue}>自定义类型…</Select.Item>
              </Select.Group></Select.Content>
            </Select.Root>
            {#if selectedType === customTypeValue}<Input aria-label="自定义文件类型" placeholder="输入文件类型" maxlength={60} bind:value={customType} />{/if}
          </div>
          <div class="flex flex-col gap-2">
            <Label for="file-visibility">申请可视范围</Label>
            <Select.Root type="single" bind:value={visibility} items={[{ value: 'committee', label: '本委员会' }, { value: 'conference', label: '全大会' }]}>
              <Select.Trigger id="file-visibility" class="w-full"><Select.Value /></Select.Trigger>
              <Select.Content><Select.Item value="committee">本委员会</Select.Item><Select.Item value="conference">全大会</Select.Item></Select.Content>
            </Select.Root>
            <p class="text-xs text-muted-foreground">主席团可在审核时缩小范围。</p>
          </div>
        </Card.Content>
        <Card.Footer class="justify-end gap-2">
          {#if replacesFileId}<Button variant="outline" onclick={() => { replacesFileId = null; notice = '' }}>取消重新提交</Button>{/if}
          <Button disabled={busy || !selectedFile || !title.trim() || !fileType.trim()} onclick={() => void send()}><FileUp data-icon="inline-start" />{busy ? '提交中…' : '提交审核'}</Button>
        </Card.Footer>
      </Card.Root>
    {/if}

    {#if canView || canSend || canReview}
      <div class="flex flex-wrap items-center gap-2">
        {#if canView}<Button variant={tab === 'published' ? 'default' : 'outline'} size="sm" onclick={() => { tab = 'published'; selectedId = null }}>已发布（{published.length}）</Button>{/if}
        {#if canSend}<Button variant={tab === 'mine' ? 'default' : 'outline'} size="sm" onclick={() => { tab = 'mine'; selectedId = null }}>我的提交（{mine.length}）</Button>{/if}
        {#if canReview}<Button variant={tab === 'workflow' ? 'default' : 'outline'} size="sm" onclick={() => { tab = 'workflow'; selectedId = null }}>主席团待审（{workflow.length + visibilityRequests.length}）</Button>{/if}
        <Select.Root type="single" bind:value={filterType} items={[{ value: '', label: '全部类型' }, ...fileTypes.map((value) => ({ value, label: value }))]}>
          <Select.Trigger class="ml-auto w-40"><Select.Value placeholder="全部类型" /></Select.Trigger>
          <Select.Content><Select.Item value="">全部类型</Select.Item>{#each fileTypes as type (type)}<Select.Item value={type}>{type}</Select.Item>{/each}</Select.Content>
        </Select.Root>
      </div>

      <div class="overflow-x-auto rounded-lg border bg-card">
        <Table.Root class="min-w-[850px]">
          <Table.Header><Table.Row><Table.Head>标题</Table.Head><Table.Head>类型</Table.Head><Table.Head>提交时间</Table.Head><Table.Head>上传者</Table.Head><Table.Head>范围</Table.Head><Table.Head>状态</Table.Head><Table.Head class="text-right">操作</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#if visibleFiles.length === 0}
              <Table.Row><Table.Cell colspan={7} class="py-8 text-center text-muted-foreground">{loading ? '正在加载…' : '暂无文件'}</Table.Cell></Table.Row>
            {:else}
              {#each visibleFiles as item (item.id)}
                <Table.Row>
                  <Table.Cell class="min-w-40 font-medium">{item.title}<p class="text-xs font-normal text-muted-foreground">{item.fileName} · {(item.size / 1024).toFixed(1)} KiB</p>{#if item.reviewNote && item.status === 'rejected'}<p class="mt-1 text-xs text-destructive">打回原因：{item.reviewNote}</p>{/if}</Table.Cell>
                  <Table.Cell>{item.fileType}</Table.Cell>
                  <Table.Cell>{new Date(item.createdAt).toLocaleString('zh-CN')}</Table.Cell>
                  <Table.Cell>{item.author.committeeName} / {item.author.seatName}</Table.Cell>
                  <Table.Cell>{visibilityLabel(item.status === 'submitted' ? item.requestedVisibility : item.visibility)}</Table.Cell>
                  <Table.Cell><Badge variant={item.status === 'published' ? 'default' : 'secondary'}>{statusLabel(item.status)}</Badge></Table.Cell>
                  <Table.Cell class="text-right">
                    <div class="flex justify-end gap-2">
                      {#if item.status === 'published' || (tab === 'workflow' && item.status === 'submitted')}
                        <Button size="sm" variant="outline" onclick={() => void downloadCloudFile(token, item).catch((caught) => { error = message(caught, '下载文件失败') })}><Download data-icon="inline-start" />下载</Button>
                      {/if}
                      {#if tab === 'workflow' && item.status === 'submitted'}<Button size="sm" onclick={() => select(item)}>审核</Button>{/if}
                      {#if tab === 'mine' && item.status === 'submitted'}<Button size="sm" variant="outline" disabled={busy} onclick={() => void mutate(() => cancelCloudFile(token, item.id), '取消提交失败', '提交已取消')}>取消提交</Button>{/if}
                      {#if tab === 'mine' && item.status === 'rejected'}<Button size="sm" onclick={() => prepareResubmit(item)}>重新提交</Button>{/if}
                      {#if tab === 'published' && item.status === 'published' && ((canWithdraw && item.sourceCommitteeId === ownCommitteeId) || canReview)}<Button size="sm" variant="outline" onclick={() => select(item)}>管理</Button>{/if}
                    </div>
                    {#if selectedId === item.id}
                      <div class="mt-3 flex min-w-64 flex-col gap-2 text-left">
                        {#if tab === 'workflow' && item.status === 'submitted'}
                          <Label for={`scope-${item.id}`}>批准后的可视范围</Label>
                          <Select.Root type="single" bind:value={approvedVisibility} items={item.requestedVisibility === 'conference' ? [{ value: 'committee', label: '本委员会' }, { value: 'conference', label: '全大会' }] : [{ value: 'committee', label: '本委员会' }]}>
                            <Select.Trigger id={`scope-${item.id}`}><Select.Value /></Select.Trigger>
                            <Select.Content><Select.Item value="committee">本委员会</Select.Item>{#if item.requestedVisibility === 'conference'}<Select.Item value="conference">全大会</Select.Item>{/if}</Select.Content>
                          </Select.Root>
                        {/if}
                        <Label for={`file-note-${item.id}`}>{tab === 'workflow' ? '审核说明（打回必填）' : '撤回原因'}</Label>
                        <Input id={`file-note-${item.id}`} maxlength={tab === 'workflow' ? 2000 : 500} bind:value={note} />
                        <div class="flex flex-wrap justify-end gap-2">
                          {#if tab === 'workflow'}
                            <Button size="sm" disabled={busy} onclick={() => void mutate(() => reviewCloudFile(token, item.id, 'approve', note.trim(), approvedVisibility), '批准失败', '文件已发布')}>批准</Button>
                            <Button size="sm" variant="destructive" disabled={busy || !note.trim()} onclick={() => void mutate(() => reviewCloudFile(token, item.id, 'reject', note.trim()), '打回失败', '文件已打回并删除云端内容')}>打回</Button>
                          {:else if tab === 'published'}
                            {#if canReview && item.visibility === 'conference'}<Button size="sm" variant="outline" disabled={busy} onclick={() => void mutate(() => requestFileVisibility(token, item.id, 'committee'), '缩小范围失败', '可视范围已缩小')}>改为本委员会</Button>{/if}
                            {#if canReview && item.visibility === 'committee'}<Button size="sm" variant="outline" disabled={busy} onclick={() => void mutate(() => requestFileVisibility(token, item.id, 'conference'), '提交范围申请失败', '已提交全大会可视申请')}>申请全大会公开</Button>{/if}
                            {#if canWithdraw && item.sourceCommitteeId === ownCommitteeId}<Button size="sm" variant="destructive" disabled={busy || !note.trim()} onclick={() => void mutate(() => withdrawCloudFile(token, item.id, note.trim()), '撤回失败', '文件已撤回并删除云端内容')}>确认撤回</Button>{/if}
                          {/if}
                          <Button size="sm" variant="outline" onclick={() => { selectedId = null; note = '' }}>关闭</Button>
                        </div>
                      </div>
                    {/if}
                  </Table.Cell>
                </Table.Row>
              {/each}
            {/if}
          </Table.Body>
        </Table.Root>
      </div>

      {#if tab === 'workflow' && visibilityRequests.length}
        <Card.Root><Card.Header><Card.Title>可视范围申请</Card.Title></Card.Header><Card.Content class="space-y-3">
          {#each visibilityRequests as request (request.id)}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>文件 {request.fileId} · 申请全大会公开 · {new Date(request.createdAt).toLocaleString('zh-CN')}</span>
              <div class="flex items-center gap-2">
                <Input aria-label="驳回原因" placeholder="驳回原因（驳回时必填）" maxlength={2000} value={requestNotes[request.id] ?? ''} oninput={(event) => { requestNotes[request.id] = event.currentTarget.value }} />
                <Button size="sm" disabled={busy} onclick={() => void mutate(() => decideFileVisibility(token, request.id, 'approve', requestNotes[request.id]?.trim() ?? ''), '批准范围失败', '可视范围已扩大')}>批准</Button>
                <Button size="sm" variant="destructive" disabled={busy || !requestNotes[request.id]?.trim()} onclick={() => void mutate(() => decideFileVisibility(token, request.id, 'reject', requestNotes[request.id].trim()), '驳回范围失败', '范围申请已驳回')}>驳回</Button>
              </div>
            </div>
          {/each}
        </Card.Content></Card.Root>
      {/if}
    {/if}
  {/if}
</div>
