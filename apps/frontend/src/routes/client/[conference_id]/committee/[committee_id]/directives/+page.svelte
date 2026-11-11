<script lang="ts">
  import { procedureMessage, renderProcedureMessage, type ProcedureMessage } from '$lib/components/conference/common/message'
  import { t, getLocale } from '$lib/i18n'
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
  let error = $state<ProcedureMessage>('')
  let draftReady = $state(false)
  let draftError = $state<ProcedureMessage>('')
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

  const statusLabels: Record<CloudDirective['status'], string> = $derived({
    submitted: t('procedure_awaiting_claim'),
    processing: t('procedure_processing'),
    approved: t('procedure_approved'),
    rejected: t('procedure_rejected'),
    cancelled: t('procedure_cancelled')
  })
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
      error = caught instanceof CloudDirectiveError ? caught.message : procedureMessage('procedure_failed_to_load_directives')
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
      error = caught instanceof CloudDirectiveError ? caught.message : procedureMessage('procedure_failed_to_submit_directive')
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
      error = procedureMessage('procedure_approval_and_rejection_require_a_decision_note_up_to_4_000_characters')
      return
    }
    busy = true
    try {
      await transitionCloudDirective(token, item.id, action, note)
      noteById[item.id] = ''
      busy = false
      await load(true)
    } catch (caught) {
      error = caught instanceof CloudDirectiveError ? caught.message : procedureMessage('procedure_failed_to_process_directive')
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
      error = caught instanceof CloudDirectiveError ? caught.message : procedureMessage('procedure_failed_to_load_revisions')
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
        draftError = procedureMessage('procedure_unable_to_read_local_draft')
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
      draftError = procedureMessage('procedure_failed_to_save_local_draft_copy_the_body_as_a_backup')
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

<svelte:head><title>{t('procedure_directives_veto')}</title></svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="flex items-center gap-2 text-xl font-semibold"><ScrollText />{t('procedure_directives')}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{t('procedure_submit_requests_to_a_committee_and_track_the_outcome')}</p>
    </div>
    <Button variant="outline" size="sm" onclick={() => void load()} disabled={loading || busy}>
      {#if loading}<Spinner data-icon="inline-start" />{:else}<RefreshCw
          data-icon="inline-start"
        />{/if}
      {t('procedure_refresh')}
    </Button>
  </header>

  {#if !token}
    <Empty.Root class="border bg-card/45 py-10">
      <Empty.Header>
        <Empty.Media variant="icon"><ScrollText /></Empty.Media>
        <Empty.Title>{t('procedure_directives_are_available_in_cloud_conferences')}</Empty.Title>
        <Empty.Description>{t('procedure_join_a_cloud_conference_to_submit_and_track_directives')}</Empty.Description>
      </Empty.Header>
    </Empty.Root>
  {:else}
    {#if error}
      <Alert.Root variant="destructive">
        <CircleAlert />
        <Alert.Description>{renderProcedureMessage(error)}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if draftError}
      <Alert.Root variant="destructive">
        <CircleAlert />
        <Alert.Description>{renderProcedureMessage(draftError)}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if otherSeatDraft}
      <Card.Root>
        <Card.Header>
          <Card.Title>{t('procedure_local_drafts_from_another_seat')}</Card.Title>
          <Card.Description>{t('procedure_other_seat_draft_notice', { value1: otherSeatDraft.seatId })}</Card.Description>
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
          <Card.Title>{editingId ? t('procedure_revise_rejected_directive') : t('procedure_submit_directive')}</Card.Title>
          <Card.Description>{t('procedure_drafts_are_saved_on_this_device_the_cloud_service_stores_them_after_submission')}</Card.Description>
        </Card.Header>
        <Card.Content>
          <Field.FieldGroup>
            <Field.Field>
              <Field.FieldLabel for="directive-title">{t('procedure_title')}</Field.FieldLabel>
              <Input
                id="directive-title"
                maxlength={200}
                bind:value={title}
                oninput={changeDraft}
              />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="directive-target">{t('procedure_target_committee')}</Field.FieldLabel>
              <Select.Select
                type="single"
                bind:value={targetCommitteeId}
                onValueChange={() => changeDraft()}
              >
                <Select.SelectTrigger id="directive-target" class="w-full">
                  {targets.find((target) => target.id === targetCommitteeId)?.name ??
                    t('procedure_choose_a_target_committee')}
                </Select.SelectTrigger>
                <Select.SelectContent>
                  {#each targets as target (target.id)}
                    <Select.SelectItem value={target.id} label={target.name} />
                  {/each}
                </Select.SelectContent>
              </Select.Select>
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="directive-content">{t('procedure_body')}</Field.FieldLabel>
              <Textarea
                id="directive-content"
                rows={8}
                maxlength={20000}
                bind:value={content}
                oninput={changeDraft}
                placeholder={t('procedure_describe_the_action_resources_and_expected_outcome')}
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
              {t('procedure_stop_editing')}
            </Button>
          {/if}
          <Button
            disabled={!title.trim() || !content.trim() || !targetCommitteeId || busy}
            onclick={() => void send()}
          >
            {#if busy}<Spinner data-icon="inline-start" />{:else}<Send
                data-icon="inline-start"
              />{/if}
            {busy ? t('procedure_submitting') : editingId ? t('procedure_revise_and_resubmit') : t('procedure_submit_directive')}
          </Button>
        </Card.Footer>
      </Card.Root>
    {/if}

    {#if canProcess}
      <section class="flex flex-col gap-3">
        <h2 class="font-semibold">
          {t('procedure_pending_directives')} <span class="text-xs text-muted-foreground">{workflow.length}</span>
        </h2>
        {#if loading && workflow.length === 0}
          {#each Array(2) as _, index (index)}{@render cardSkeleton()}{/each}
        {:else if workflow.length === 0}
          {@render listEmpty(t('procedure_no_pending_directives'), t('procedure_new_directives_will_appear_here'))}
        {/if}
        {#each workflow as item (item.id)}
          <Card.Root>
            <Card.Header>
              <div class="flex justify-between gap-3">
                <div>
                  <Card.Title>{item.title}</Card.Title>
                  <Card.Description>
                    {t('procedure_directive_author_revision', { value1: item.author.committeeName ?? '', value2: item.author.seatName ?? '', value3: item.revision })}
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
                  {t('procedure_claim_directive')}
                </Button>
              {:else if item.claimedByMe}
                <div class="flex flex-col gap-2 border-t pt-4">
                  <Field.FieldGroup>
                    <Field.Field>
                      <Field.FieldLabel for={`note-${item.id}`}>{t('procedure_decision_note')}</Field.FieldLabel>
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
                      {t('procedure_reject')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || !noteById[item.id]?.trim()}
                      onclick={() => void transition(item, 'approve')}
                    >
                      {t('procedure_approve')}
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
          {t('procedure_my_directives')} <span class="text-xs text-muted-foreground">{mine.length}</span>
        </h2>
        {#if loading && mine.length === 0}
          {#each Array(2) as _, index (index)}{@render cardSkeleton()}{/each}
        {:else if mine.length === 0}
          {@render listEmpty(t('procedure_no_directives_submitted'), t('procedure_use_the_form_above_to_submit_your_first_directive'))}
        {/if}
        {#each mine as item (item.id)}
          <Card.Root>
            <Card.Header>
              <div class="flex justify-between gap-3">
                <div>
                  <Card.Title>{item.title}</Card.Title>
                  <Card.Description>
                    {t('procedure_directive_target_revision_time', { value1: item.targetCommitteeName ?? '', value2: item.revision, value3: new Date(
                      item.createdAt
                    ).toLocaleString(getLocale()) })}
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
                <p class="rounded-md bg-muted p-3 text-sm">{t('procedure_directive_decision_note', { value1: item.processingNote })}</p>
              {/if}
              <div class="flex flex-wrap gap-2">
                {#if item.status === 'submitted'}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onclick={() => void transition(item, 'cancel')}
                  >
                    {t('procedure_cancel_directive')}
                  </Button>
                {/if}
                {#if item.status === 'rejected'}
                  <Button variant="outline" size="sm" disabled={busy} onclick={() => revise(item)}>
                    {t('procedure_revise_and_resubmit_2')}
                  </Button>
                {/if}
                <Button variant="ghost" size="sm" onclick={() => void toggleHistory(item)}>
                  {showHistory[item.id] ? t('procedure_hide_revisions') : t('procedure_view_revisions')}
                </Button>
              </div>
              {#if showHistory[item.id]}
                <div class="flex flex-col gap-2 border-t pt-3">
                  {#each revisions[item.id] ?? [] as revision (revision.revision)}
                    <div class="rounded-md bg-muted/60 p-3 text-sm">
                      <p class="font-medium">{t('procedure_directive_revision_title', { value1: revision.revision, value2: revision.title })}</p>
                      <p class="mt-1 whitespace-pre-wrap">{revision.content}</p>
                      {#if revision.decisionNote}
                        <p class="mt-2 text-muted-foreground">
                          {t('procedure_directive_revision_decision', { value1: revision.decision === 'rejected'
                            ? t('procedure_reject')
                            : t('procedure_approve'), value2: revision.decisionNote })}
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
