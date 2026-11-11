<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t, getLocale, formatNumber } from '$lib/i18n'
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
  let error = $state<ProcedureMessage>('')
  let notice = $state<ProcedureMessage>('')
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
    .sort((a, b) => a.localeCompare(b, getLocale())))
  const currentList = $derived(tab === 'published' ? published : tab === 'mine' ? mine : workflow)
  const visibleFiles = $derived(currentList.filter((item) => !filterType || item.fileType === filterType))

  function fileTypeLabel(value: string): string {
    return value === '会议材料' ? t('procedure_conference_materials') : value
  }

  function message(caught: unknown, fallback: ProcedureMessage): ProcedureMessage {
    return caught instanceof CloudFileError ? caught.message : fallback
  }

  function statusLabel(status: FileContent['status']): string {
    return ({ submitted: t('procedure_awaiting_review'), published: t('procedure_published_2'), rejected: t('procedure_returned_for_revision'),
      cancelled: t('procedure_cancelled'), withdrawn: t('procedure_withdrawn') })[status]
  }

  function visibilityLabel(value: FileVisibility): string {
    return value === 'conference' ? t('procedure_entire_conference') : t('procedure_this_committee')
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
      if (sequence === loadSequence) error = message(caught, procedureMessage('procedure_failed_to_load_files'))
    } finally {
      if (sequence === loadSequence) loading = false
    }
  }

  async function send(): Promise<void> {
    if (!token || !canSend || !selectedFile || busy) return
    if (!title.trim() || !fileType.trim()) { error = procedureMessage('procedure_enter_a_title_and_file_type'); return }
    if (selectedFile.size === 0 || selectedFile.size > 20 * 1024 * 1024) {
      error = procedureMessage('procedure_choose_a_non_empty_file_no_larger_than_20_mib')
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
      notice = procedureMessage('procedure_file_submitted_for_chair_review')
      await load(true)
    } catch (caught) {
      error = message(caught, procedureMessage('procedure_failed_to_submit_file'))
    } finally { busy = false }
  }

  function prepareResubmit(item: FileContent): void {
    replacesFileId = item.id
    title = item.title
    selectedType = fileTypes.includes(item.fileType) ? item.fileType : customTypeValue
    if (selectedType === customTypeValue) customType = item.fileType
    visibility = item.requestedVisibility
    notice = procedureMessage('procedure_choose_the_revised_local_file_then_resubmit_it_for_review')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function mutate(operation: () => Promise<unknown>, fallback: ProcedureMessage, success: ProcedureMessage): Promise<void> {
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

<svelte:head><title>{t('procedure_files_veto')}</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-2 text-xl font-semibold"><FolderOpen />{t('procedure_files')}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{t('procedure_files_are_reviewed_by_the_chair_and_become_available_for_download_within_their_approve')}</p>
    </div>
    {#if token}<Button variant="outline" size="sm" onclick={() => void load()} disabled={loading || busy}><RefreshCw data-icon="inline-start" />{t('procedure_refresh')}</Button>{/if}
  </header>

  {#if !token}
    <Empty.Root class="border bg-card/45 py-10"><Empty.Header>
      <Empty.Media variant="icon"><FolderOpen /></Empty.Media>
      <Empty.Title>{t('procedure_files_are_available_in_cloud_conferences')}</Empty.Title>
      <Empty.Description>{t('procedure_join_a_cloud_conference_to_use_files')}</Empty.Description>
    </Empty.Header></Empty.Root>
  {:else}
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Description>{renderProcedureMessage(error)}</Alert.Description></Alert.Root>{/if}
    {#if notice}<p class="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{renderProcedureMessage(notice)}</p>{/if}

    {#if canSend}
      <Card.Root>
        <Card.Header>
          <Card.Title>{replacesFileId ? t('procedure_resubmit_file') : t('procedure_submit_file')}</Card.Title>
          <Card.Description>{t('procedure_uploaded_files_are_reviewed_by_the_chair_returned_files_have_their_cloud_content_delet')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <Label for="file-upload">{t('procedure_choose_a_local_file_up_to_20_mib')}</Label>
            <Input id="file-upload" type="file" class="mt-2" disabled={busy}
              onchange={(event) => {
                selectedFile = event.currentTarget.files?.[0] ?? null
                if (selectedFile && !title) title = selectedFile.name.replace(/\.[^.]+$/, '')
              }} />
          </div>
          <div><Label for="file-title">{t('procedure_title')}</Label><Input id="file-title" class="mt-2" maxlength={200} bind:value={title} /></div>
          <div class="flex flex-col gap-2">
            <Label for="file-type">{t('procedure_file_type')}</Label>
            <Select.Root type="single" bind:value={selectedType} items={[...fileTypes.map((value) => ({ value, label: fileTypeLabel(value) })), { value: customTypeValue, label: t('procedure_custom_type') }]}>
              <Select.Trigger id="file-type" class="w-full"><Select.Value placeholder={t('procedure_choose_file_type')} /></Select.Trigger>
              <Select.Content><Select.Group>
                {#each fileTypes as type (type)}<Select.Item value={type}>{fileTypeLabel(type)}</Select.Item>{/each}
                <Select.Item value={customTypeValue}>{t('procedure_custom_type')}</Select.Item>
              </Select.Group></Select.Content>
            </Select.Root>
            {#if selectedType === customTypeValue}<Input aria-label={t('procedure_custom_file_type')} placeholder={t('procedure_enter_file_type')} maxlength={60} bind:value={customType} />{/if}
          </div>
          <div class="flex flex-col gap-2">
            <Label for="file-visibility">{t('procedure_requested_visibility')}</Label>
            <Select.Root type="single" bind:value={visibility} items={[{ value: 'committee', label: t('procedure_this_committee') }, { value: 'conference', label: t('procedure_entire_conference') }]}>
              <Select.Trigger id="file-visibility" class="w-full"><Select.Value /></Select.Trigger>
              <Select.Content><Select.Item value="committee">{t('procedure_this_committee')}</Select.Item><Select.Item value="conference">{t('procedure_entire_conference')}</Select.Item></Select.Content>
            </Select.Root>
            <p class="text-xs text-muted-foreground">{t('procedure_the_chair_may_restrict_visibility_during_review')}</p>
          </div>
        </Card.Content>
        <Card.Footer class="justify-end gap-2">
          {#if replacesFileId}<Button variant="outline" onclick={() => { replacesFileId = null; notice = '' }}>{t('procedure_cancel_resubmission')}</Button>{/if}
          <Button disabled={busy || !selectedFile || !title.trim() || !fileType.trim()} onclick={() => void send()}><FileUp data-icon="inline-start" />{busy ? t('procedure_submitting') : t('procedure_submit_for_review')}</Button>
        </Card.Footer>
      </Card.Root>
    {/if}

    {#if canView || canSend || canReview}
      <div class="flex flex-wrap items-center gap-2">
        {#if canView}<Button variant={tab === 'published' ? 'default' : 'outline'} size="sm" onclick={() => { tab = 'published'; selectedId = null }}>{t('procedure_published_file_count', { value1: published.length })}</Button>{/if}
        {#if canSend}<Button variant={tab === 'mine' ? 'default' : 'outline'} size="sm" onclick={() => { tab = 'mine'; selectedId = null }}>{t('procedure_my_file_count', { value1: mine.length })}</Button>{/if}
        {#if canReview}<Button variant={tab === 'workflow' ? 'default' : 'outline'} size="sm" onclick={() => { tab = 'workflow'; selectedId = null }}>{t('procedure_file_review_count', { value1: workflow.length + visibilityRequests.length })}</Button>{/if}
        <Select.Root type="single" bind:value={filterType} items={[{ value: '', label: t('procedure_all_types') }, ...fileTypes.map((value) => ({ value, label: fileTypeLabel(value) }))]}>
          <Select.Trigger class="ml-auto w-40"><Select.Value placeholder={t('procedure_all_types')} /></Select.Trigger>
          <Select.Content><Select.Item value="">{t('procedure_all_types')}</Select.Item>{#each fileTypes as type (type)}<Select.Item value={type}>{fileTypeLabel(type)}</Select.Item>{/each}</Select.Content>
        </Select.Root>
      </div>

      <div class="overflow-x-auto rounded-lg border bg-card">
        <Table.Root class="min-w-[850px]">
          <Table.Header><Table.Row><Table.Head>{t('procedure_title')}</Table.Head><Table.Head>{t('procedure_type')}</Table.Head><Table.Head>{t('procedure_submitted_at')}</Table.Head><Table.Head>{t('procedure_uploaded_by')}</Table.Head><Table.Head>{t('procedure_visibility')}</Table.Head><Table.Head>{t('procedure_status')}</Table.Head><Table.Head class="text-right">{t('procedure_actions')}</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#if visibleFiles.length === 0}
              <Table.Row><Table.Cell colspan={7} class="py-8 text-center text-muted-foreground">{loading ? t('procedure_loading_2') : t('procedure_no_files')}</Table.Cell></Table.Row>
            {:else}
              {#each visibleFiles as item (item.id)}
                <Table.Row>
                  <Table.Cell class="min-w-40 font-medium">{item.title}<p class="text-xs font-normal text-muted-foreground">{item.fileName} · {formatNumber(item.size / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KiB</p>{#if item.reviewNote && item.status === 'rejected'}<p class="mt-1 text-xs text-destructive">{t('procedure_file_review_note', { value1: item.reviewNote })}</p>{/if}</Table.Cell>
                  <Table.Cell>{item.fileType}</Table.Cell>
                  <Table.Cell>{new Date(item.createdAt).toLocaleString(getLocale())}</Table.Cell>
                  <Table.Cell>{item.author.committeeName} / {item.author.seatName}</Table.Cell>
                  <Table.Cell>{visibilityLabel(item.status === 'submitted' ? item.requestedVisibility : item.visibility)}</Table.Cell>
                  <Table.Cell><Badge variant={item.status === 'published' ? 'default' : 'secondary'}>{statusLabel(item.status)}</Badge></Table.Cell>
                  <Table.Cell class="text-right">
                    <div class="flex justify-end gap-2">
                      {#if item.status === 'published' || (tab === 'workflow' && item.status === 'submitted')}
                        <Button size="sm" variant="outline" onclick={() => void downloadCloudFile(token, item).catch((caught) => { error = message(caught, procedureMessage('procedure_failed_to_download_file')) })}><Download data-icon="inline-start" />{t('procedure_download')}</Button>
                      {/if}
                      {#if tab === 'workflow' && item.status === 'submitted'}<Button size="sm" onclick={() => select(item)}>{t('procedure_review')}</Button>{/if}
                      {#if tab === 'mine' && item.status === 'submitted'}<Button size="sm" variant="outline" disabled={busy} onclick={() => void mutate(() => cancelCloudFile(token, item.id), procedureMessage('procedure_failed_to_cancel_submission'), procedureMessage('procedure_submission_cancelled'))}>{t('procedure_cancel_submission')}</Button>{/if}
                      {#if tab === 'mine' && item.status === 'rejected'}<Button size="sm" onclick={() => prepareResubmit(item)}>{t('procedure_resubmit')}</Button>{/if}
                      {#if tab === 'published' && item.status === 'published' && ((canWithdraw && item.sourceCommitteeId === ownCommitteeId) || canReview)}<Button size="sm" variant="outline" onclick={() => select(item)}>{t('procedure_manage')}</Button>{/if}
                    </div>
                    {#if selectedId === item.id}
                      <div class="mt-3 flex min-w-64 flex-col gap-2 text-left">
                        {#if tab === 'workflow' && item.status === 'submitted'}
                          <Label for={`scope-${item.id}`}>{t('procedure_approved_visibility')}</Label>
                          <Select.Root type="single" bind:value={approvedVisibility} items={item.requestedVisibility === 'conference' ? [{ value: 'committee', label: t('procedure_this_committee') }, { value: 'conference', label: t('procedure_entire_conference') }] : [{ value: 'committee', label: t('procedure_this_committee') }]}>
                            <Select.Trigger id={`scope-${item.id}`}><Select.Value /></Select.Trigger>
                            <Select.Content><Select.Item value="committee">{t('procedure_this_committee')}</Select.Item>{#if item.requestedVisibility === 'conference'}<Select.Item value="conference">{t('procedure_entire_conference')}</Select.Item>{/if}</Select.Content>
                          </Select.Root>
                        {/if}
                        <Label for={`file-note-${item.id}`}>{tab === 'workflow' ? t('procedure_review_note_required_when_returning') : t('procedure_withdrawal_reason')}</Label>
                        <Input id={`file-note-${item.id}`} maxlength={tab === 'workflow' ? 2000 : 500} bind:value={note} />
                        <div class="flex flex-wrap justify-end gap-2">
                          {#if tab === 'workflow'}
                            <Button size="sm" disabled={busy} onclick={() => void mutate(() => reviewCloudFile(token, item.id, 'approve', note.trim(), approvedVisibility), procedureMessage('procedure_failed_to_approve'), procedureMessage('procedure_file_published'))}>{t('procedure_approve')}</Button>
                            <Button size="sm" variant="destructive" disabled={busy || !note.trim()} onclick={() => void mutate(() => reviewCloudFile(token, item.id, 'reject', note.trim()), procedureMessage('procedure_failed_to_return_file'), procedureMessage('procedure_file_returned_and_cloud_content_deleted'))}>{t('procedure_return_for_revision')}</Button>
                          {:else if tab === 'published'}
                            {#if canReview && item.visibility === 'conference'}<Button size="sm" variant="outline" disabled={busy} onclick={() => void mutate(() => requestFileVisibility(token, item.id, 'committee'), procedureMessage('procedure_failed_to_restrict_visibility'), procedureMessage('procedure_visibility_restricted'))}>{t('procedure_restrict_to_this_committee')}</Button>{/if}
                            {#if canReview && item.visibility === 'committee'}<Button size="sm" variant="outline" disabled={busy} onclick={() => void mutate(() => requestFileVisibility(token, item.id, 'conference'), procedureMessage('procedure_failed_to_submit_visibility_request'), procedureMessage('procedure_conference_wide_visibility_requested'))}>{t('procedure_request_conference_wide_visibility')}</Button>{/if}
                            {#if canWithdraw && item.sourceCommitteeId === ownCommitteeId}<Button size="sm" variant="destructive" disabled={busy || !note.trim()} onclick={() => void mutate(() => withdrawCloudFile(token, item.id, note.trim()), procedureMessage('procedure_failed_to_withdraw'), procedureMessage('procedure_file_withdrawn_and_cloud_content_deleted'))}>{t('procedure_confirm_withdrawal')}</Button>{/if}
                          {/if}
                          <Button size="sm" variant="outline" onclick={() => { selectedId = null; note = '' }}>{t('procedure_close')}</Button>
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
        <Card.Root><Card.Header><Card.Title>{t('procedure_visibility_requests')}</Card.Title></Card.Header><Card.Content class="space-y-3">
          {#each visibilityRequests as request (request.id)}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>{t('procedure_file_visibility_request_summary', { value1: request.fileId, value2: new Date(request.createdAt).toLocaleString(getLocale()) })}</span>
              <div class="flex items-center gap-2">
                <Input aria-label={t('procedure_rejection_reason')} placeholder={t('procedure_rejection_reason_required_when_rejecting')} maxlength={2000} value={requestNotes[request.id] ?? ''} oninput={(event) => { requestNotes[request.id] = event.currentTarget.value }} />
                <Button size="sm" disabled={busy} onclick={() => void mutate(() => decideFileVisibility(token, request.id, 'approve', requestNotes[request.id]?.trim() ?? ''), procedureMessage('procedure_failed_to_approve_visibility_request'), procedureMessage('procedure_visibility_expanded'))}>{t('procedure_approve')}</Button>
                <Button size="sm" variant="destructive" disabled={busy || !requestNotes[request.id]?.trim()} onclick={() => void mutate(() => decideFileVisibility(token, request.id, 'reject', requestNotes[request.id].trim()), procedureMessage('procedure_failed_to_reject_visibility_request'), procedureMessage('procedure_visibility_request_rejected'))}>{t('procedure_reject')}</Button>
              </div>
            </div>
          {/each}
        </Card.Content></Card.Root>
      {/if}
    {/if}
  {/if}
</div>
