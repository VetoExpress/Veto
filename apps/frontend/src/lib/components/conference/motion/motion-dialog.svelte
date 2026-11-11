<script lang="ts">
  import { t } from '$lib/i18n'
  import {
    Presentation,
    Timer,
    MessageSquare,
    Pencil,
    Gavel,
    Coffee,
    LogOut,
    Vote,
    UserRoundCheck,
    Mic
  } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js'
  import {
    currentCommittee,
    motionDraft,
    proposeMotion,
    approveMotion,
    dismissLastResolvedMotion
  } from '$lib/classes/stores/conference/conference-store'
  import { resolveMotion, calcMaxSpeakers } from '$lib/classes/services/engine/conference-engine'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { MOTION_LABELS } from '$lib/classes/types/conference'
  import type { MotionType, Attendance, ParticipantSeat } from '$lib/classes/types/conference'
  import SeatSelector from '$lib/components/conference/common/seat-selector.svelte'
  import { toSeatView } from '$lib/classes/types/delegate'

  let { open = $bindable(false) }: { open: boolean } = $props()

  const conf = $derived($currentCommittee)
  const conferenceId = $derived(page.params.conference_id ?? conf?.id ?? null)
  const committeeId = $derived(page.params.committee_id ?? null)

  // Proposer
  let selectedProposer = $state<ParticipantSeat | null>(null)

  // 常用动议列表——根据当前阶段和选中席位的出席状态动态调整
  const motionTypes = $derived.by((): MotionType[] => {
    // 缺席的席位只能提出"更改出席状态"动议
    if (selectedProposer && selectedProposer.procedure.attendance === 'absent') {
      return ['change_attendance']
    }

    if (conf?.phase === 'voting') {
      // 结束辩论后：可进行实质性投票、开启主发言名单（退出投票阶段）、休会/闭幕
      return [
        'change_attendance',
        'substantive_vote',
        'open_speakers_list',
        'suspend_meeting',
        'close_meeting'
      ]
    }
    // 等待开启主发言名单：首要动议为开启主发言名单
    if (conf?.phase === 'pending_speakers_list') {
      return ['change_attendance', 'open_speakers_list']
    }
    // 主发言名单已开启时不可再次动议开启
    if (conf?.phase === 'general_debate') {
      return [
        'change_attendance',
        'moderated_caucus',
        'unmoderated_caucus',
        'moderated_debate',
        'unmoderated_debate',
        'individual_speech',
        'modify_speaking_time',
        'closure_debate',
        'suspend_meeting',
        'close_meeting'
      ]
    }
    return [
      'change_attendance',
      'open_speakers_list',
      'moderated_caucus',
      'unmoderated_caucus',
      'moderated_debate',
      'unmoderated_debate',
      'modify_speaking_time',
      'closure_debate',
      'suspend_meeting',
      'close_meeting'
    ]
  })

  const MOTION_ICONS: Record<string, typeof Presentation> = {
    open_speakers_list: Presentation,
    moderated_caucus: MessageSquare,
    unmoderated_caucus: Coffee,
    moderated_debate: MessageSquare,
    unmoderated_debate: MessageSquare,
    modify_speaking_time: Pencil,
    closure_debate: Gavel,
    suspend_meeting: Timer,
    close_meeting: LogOut,
    substantive_vote: Vote,
    change_attendance: UserRoundCheck,
    individual_speech: Mic
  }

  // ---- Form state ----
  let selectedType = $state<MotionType | null>(null)
  // ToggleGroup 需要 string 类型的 value 绑定
  let toggleValue = $state('')
  $effect(() => {
    if (toggleValue) {
      selectedType = toggleValue as MotionType
    }
  })
  // Moderated Caucus（无预设值，必须手动填写）
  let mcTopic = $state('')
  let committedTopic = $state('')
  let mcTotalSec = $state<number | null>(360)
  let committedMcTotalSec = $state<number | null>(360)
  let mcSpeakerSec = $state<number | null>(60)
  let committedMcSpeakerSec = $state<number | null>(60)
  // Moderated Debate
  let mdTopic = $state('')
  let committedMdTopic = $state('')
  // 自由磋商 / 有主持的辩论 / 自由辩论（均为总倒计时）
  let ucDurationMin = $state(15)
  let committedUcDurationMin = $state(15)
  // Modify Speaking Time
  let newTimeSec = $state(90)
  let committedNewTimeSec = $state(90)
  // Substantive Vote
  let documentName = $state('')
  let committedDocumentName = $state('')
  // Change Attendance —— 由当前出席状态决定，只能选相反状态
  let newAttendance = $derived<Attendance>(
    selectedProposer?.procedure.attendance === 'present' ? 'absent' : 'present'
  )
  // Individual Speech
  let isDurationSec = $state(120)
  let committedIsDurationSec = $state(120)

  function resetForm(): void {
    selectedProposer = null
    selectedType = null
    toggleValue = ''
    mcTopic = ''
    committedTopic = ''
    mcTotalSec = 360
    committedMcTotalSec = 360
    mcSpeakerSec = 60
    committedMcSpeakerSec = 60
    mdTopic = ''
    committedMdTopic = ''
    ucDurationMin = 15
    committedUcDurationMin = 15
    newTimeSec = 90
    committedNewTimeSec = 90
    documentName = ''
    committedDocumentName = ''
    isDurationSec = 120
    committedIsDurationSec = 120
  }

  function handleOpenChange(value: boolean): void {
    if (!value) {
      resetForm()
      motionDraft.set(null)
      dismissLastResolvedMotion()
    }
    open = value
  }

  function handlePropose(): void {
    if (!selectedType || !conf) return

    const proposerDel = selectedProposer || conf.participantSeats[0]
    if (!proposerDel) return

    // 使用 committed 值（onblur 已提交），保证 Display 端动画已完整播放
    let motionData: any = {
      type: selectedType,
      proposedBySeatId: proposerDel.id
    }

    switch (selectedType) {
      case 'moderated_caucus': {
        const total = committedMcTotalSec ?? 0
        const perSpeaker = committedMcSpeakerSec ?? 0
        motionData.topic = committedTopic.trim() || t('procedure_no_topic_specified')
        motionData.totalTimeSec = total
        motionData.speakingTimePerPersonSec = perSpeaker
        motionData.maxSpeakers = calcMaxSpeakers(total, perSpeaker)
        break
      }
      case 'moderated_debate':
        motionData.topic = committedMdTopic.trim()
        motionData.durationSec = committedUcDurationMin * 60
        break
      case 'unmoderated_caucus':
      case 'unmoderated_debate':
        motionData.durationSec = committedUcDurationMin * 60
        break
      case 'modify_speaking_time':
        motionData.newTimeSec = committedNewTimeSec
        break
      case 'substantive_vote':
        motionData.documentName = committedDocumentName.trim() || t('procedure_untitled_document')
        break
      case 'change_attendance':
        motionData.newAttendance = newAttendance
        break
      case 'individual_speech':
        motionData.durationSec = committedIsDurationSec
        break
    }

    proposeMotion(motionData)

    // 判断是否需要表决：需表决 → 导航到动议表决页；否则直接通过执行
    const resolution = resolveMotion(selectedType)
    if (!resolution.requiresVoting || resolution.autoApprove) {
      const updatedConf = $currentCommittee
      const newMotion = updatedConf?.motions[updatedConf.motions.length - 1]
      if (newMotion) {
        approveMotion(newMotion.id)

        if (
          selectedType === 'moderated_caucus' ||
          selectedType === 'unmoderated_caucus' ||
          selectedType === 'moderated_debate' ||
          selectedType === 'unmoderated_debate' ||
          selectedType === 'individual_speech'
        ) {
          import('$lib/classes/stores/conference/conference-store').then(({ startCaucus }) => {
            startCaucus(newMotion.id)
          })
        }
      }
    } else {
      if (conferenceId && committeeId) {
        goto(resolve(`/client/${conferenceId}/committee/${committeeId}/chair/motion`))
      }
    }

    open = false
    resetForm()
    motionDraft.set(null)
  }

  const mcMaxSpeakers = $derived(
    mcTotalSec != null && mcSpeakerSec != null && mcSpeakerSec > 0
      ? calcMaxSpeakers(mcTotalSec, mcSpeakerSec)
      : 0
  )

  // 当前表单是否有未失焦的输入（live !== committed），防止动画未完成就提交
  const isDirty = $derived.by(() => {
    switch (selectedType) {
      case 'moderated_caucus':
        return (
          mcTopic !== committedTopic ||
          mcTotalSec !== committedMcTotalSec ||
          mcSpeakerSec !== committedMcSpeakerSec
        )
      case 'unmoderated_caucus':
      case 'unmoderated_debate':
        return ucDurationMin !== committedUcDurationMin
      case 'moderated_debate':
        return mdTopic !== committedMdTopic || ucDurationMin !== committedUcDurationMin
      case 'individual_speech':
        return isDurationSec !== committedIsDurationSec
      case 'modify_speaking_time':
        return newTimeSec !== committedNewTimeSec
      case 'substantive_vote':
        return documentName !== committedDocumentName
      case 'change_attendance':
        return false // no debounce needed for seat selector
      default:
        return false
    }
  })

  const canPropose = $derived(
    selectedType !== null &&
      selectedProposer !== null &&
      !isDirty &&
      (selectedType !== 'substantive_vote' || committedDocumentName.trim() !== '') &&
      (selectedType !== 'moderated_debate' || committedMdTopic.trim() !== '') &&
      (selectedType !== 'moderated_caucus' ||
        (committedTopic.trim() !== '' &&
          committedMcTotalSec != null &&
          committedMcTotalSec > 0 &&
          committedMcSpeakerSec != null &&
          committedMcSpeakerSec > 0))
  )

  // 实时同步动议草稿到 Display
  $effect(() => {
    if (!open) {
      motionDraft.set(null)
      return
    }
    const proposerDel = selectedProposer
    motionDraft.set({
      proposedBy: proposerDel ? toSeatView(proposerDel) : undefined,
      type: selectedType ?? undefined,
      isRequestingVote: selectedType ? resolveMotion(selectedType).requiresVoting : undefined,
      topic:
        selectedType === 'moderated_caucus'
          ? committedTopic.trim() || undefined
          : selectedType === 'moderated_debate'
            ? committedMdTopic.trim() || undefined
            : undefined,
      totalTimeSec:
        selectedType === 'moderated_caucus'
          ? (committedMcTotalSec ?? undefined)
          : selectedType === 'unmoderated_caucus' ||
              selectedType === 'moderated_debate' ||
              selectedType === 'unmoderated_debate'
            ? committedUcDurationMin * 60
            : selectedType === 'individual_speech'
              ? committedIsDurationSec
              : undefined,
      speakingTimePerPersonSec:
        selectedType === 'moderated_caucus' ? (committedMcSpeakerSec ?? undefined) : undefined,
      newTimeSec: selectedType === 'modify_speaking_time' ? committedNewTimeSec : undefined,
      documentName:
        selectedType === 'substantive_vote' ? committedDocumentName.trim() || undefined : undefined
    })
  })
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-lg">
      <Dialog.Header class="pb-1">
        <Dialog.Title class="flex items-center gap-2 text-base font-semibold">
          <Presentation size={18} class="text-indigo-500" />
          {t('procedure_motions_and_procedure')}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          {t('procedure_choose_a_proposer_then_a_motion_or_procedure_type')}
        </Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col gap-4 py-2">
        <!-- 第一步：动议提出方（始终可见） -->
        {#if conf}
          <div>
            <Label class="mb-2 block text-xs text-muted-foreground">{t('procedure_motion_proposer')}</Label>
            <SeatSelector seats={conf.participantSeats} bind:value={selectedProposer} />
          </div>
        {/if}

        <!-- 第二步：动议类型选择（选完提出方后出现） -->
        {#if selectedProposer}
          <Separator />
          <div>
            <Label class="mb-2 block text-xs text-muted-foreground">{t('procedure_motion_type')}</Label>
            <ToggleGroup.Root type="single" bind:value={toggleValue} class="grid grid-cols-4 gap-2">
              {#each motionTypes as mt (mt)}
                {@const Icon = MOTION_ICONS[mt] ?? Presentation}
                <ToggleGroup.Item value={mt}>
                  <Icon size={14} />
                  <span class="text-xs font-medium">{MOTION_LABELS[mt]}</span>
                </ToggleGroup.Item>
              {/each}
            </ToggleGroup.Root>
          </div>
        {/if}

        <!-- 第三步：动议参数表单 -->
        {#if selectedType === 'moderated_caucus'}
          <Separator />
          <div class="space-y-3">
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <Label class="text-xs text-muted-foreground">{t('procedure_topic_2')}</Label>
                <span class="text-[10px] text-muted-foreground/60">{mcTopic.length}/100</span>
              </div>
              <Input
                bind:value={mcTopic}
                maxlength={100}
                class="h-9 text-sm"
                onblur={() => (committedTopic = mcTopic)}
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_total_duration_seconds')}</Label>
                <Input
                  type="number"
                  min="30"
                  max="3600"
                  step="30"
                  placeholder={t('procedure_required')}
                  bind:value={mcTotalSec}
                  class="h-9 text-sm"
                  onblur={() => (committedMcTotalSec = mcTotalSec)}
                />
                <div class="mt-1.5 flex gap-1">
                  {#each [180, 360, 600] as sec (sec)}
                    <Button
                      variant="outline"
                      size="xs"
                      onclick={() => ((mcTotalSec = sec), (committedMcTotalSec = sec))}
                    >
                      {sec}s
                    </Button>
                  {/each}
                </div>
              </div>
              <div>
                <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_speaking_time_per_person_seconds')}</Label>
                <Input
                  type="number"
                  min="15"
                  max={mcTotalSec ?? 600}
                  step="15"
                  placeholder={t('procedure_enter_total_duration_first')}
                  disabled={mcTotalSec == null}
                  bind:value={mcSpeakerSec}
                  class="h-9 text-sm"
                  onblur={() => (committedMcSpeakerSec = mcSpeakerSec)}
                />
                <div class="mt-1.5 flex gap-1">
                  {#each [60, 120, 180] as sec (sec)}
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={mcTotalSec == null}
                      onclick={() => ((mcSpeakerSec = sec), (committedMcSpeakerSec = sec))}
                    >
                      {sec}s
                    </Button>
                  {/each}
                </div>
              </div>
            </div>
            {#if committedMcTotalSec != null && committedMcSpeakerSec != null && committedMcTotalSec > 0 && committedMcSpeakerSec > 0}
              <div
                class="rounded-md bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground"
              >
                {t('procedure_caucus_capacity_calculation', { total: committedMcTotalSec, seconds: committedMcSpeakerSec, speakers: mcMaxSpeakers })}
              </div>
            {/if}
          </div>
        {:else if selectedType === 'moderated_debate'}
          <Separator />
          <div class="flex flex-col gap-3">
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <Label class="text-xs text-muted-foreground">{t('procedure_topic_2')}</Label>
                <span class="text-[10px] text-muted-foreground/60">{mdTopic.length}/100</span>
              </div>
              <Input
                bind:value={mdTopic}
                maxlength={100}
                class="h-9 text-sm"
                onblur={() => (committedMdTopic = mdTopic)}
              />
            </div>
            <div>
              <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_duration_minutes')}</Label>
              <Input
                type="number"
                min="1"
                max="120"
                bind:value={ucDurationMin}
                class="h-9 w-32 text-sm"
                onblur={() => (committedUcDurationMin = ucDurationMin)}
              />
              <p class="mt-1 text-[10px] text-muted-foreground">{t('procedure_the_countdown_starts_for_this_topic_when_the_debate_begins')}</p>
            </div>
          </div>
        {:else if selectedType === 'unmoderated_caucus' || selectedType === 'unmoderated_debate'}
          <div>
            <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_duration_minutes')}</Label>
            <Input
              type="number"
              min="1"
              max="120"
              bind:value={ucDurationMin}
              class="h-9 text-sm w-32"
              onblur={() => (committedUcDurationMin = ucDurationMin)}
            />
            <p class="mt-1 text-[10px] text-muted-foreground">{t('procedure_the_countdown_starts_when_this_begins')}</p>
          </div>
        {:else if selectedType === 'modify_speaking_time'}
          <div>
            <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_new_default_speaking_time_seconds')}</Label>
            <Input
              type="number"
              min="30"
              max="600"
              step="15"
              bind:value={newTimeSec}
              class="h-9 text-sm w-32"
              onblur={() => (committedNewTimeSec = newTimeSec)}
            />
          </div>
        {:else if selectedType === 'substantive_vote'}
          <Separator />
          <div>
            <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_document_name')}</Label>
            <Input
              bind:value={documentName}
              class="h-9 text-sm"
              placeholder={t('procedure_for_example_draft_resolution_1_1')}
              onblur={() => (committedDocumentName = documentName)}
              list="document-name-suggestions"
            />
            {#if conf?.documentNames?.length}
              <datalist id="document-name-suggestions">
                {#each conf.documentNames as name (name)}
                  <option value={name}></option>
                {/each}
              </datalist>
            {/if}
            <p class="mt-1 text-[10px] text-muted-foreground">
              {t('procedure_motion_document_voting_rule', { value1: conf?.substantiveVotingMajority === 'simple_majority' ? t('procedure_simple_majority_2') : t('procedure_two_thirds_majority_3') })}
            </p>
          </div>
        {:else if selectedType === 'individual_speech'}
          <div>
            <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_speaking_duration_seconds')}</Label>
            <Input
              type="number"
              min="1"
              step="15"
              bind:value={isDurationSec}
              class="h-9 text-sm w-32"
              onblur={() => (committedIsDurationSec = isDurationSec)}
            />
            <div class="mt-1.5 flex gap-1">
              {#each [60, 120, 300] as sec (sec)}
                <Button
                  variant="outline"
                  size="xs"
                  onclick={() => ((isDurationSec = sec), (committedIsDurationSec = sec))}
                >
                  {sec}s
                </Button>
              {/each}
            </div>
            {#if selectedProposer}
              <p class="mt-1 text-[10px] text-muted-foreground">
                {t('procedure_individual_speech_duration', { value1: selectedProposer.name, value2: committedIsDurationSec })}
              </p>
            {/if}
          </div>
        {:else if selectedType === 'change_attendance'}
          <Separator />
          <div>
            <Label class="mb-1.5 block text-xs text-muted-foreground">{t('procedure_new_attendance')}</Label>
            <div
              class="flex-1 rounded-lg border px-3 py-2 text-sm text-center font-medium {newAttendance ===
              'present'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'border-red-400 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-950/40 dark:text-red-400'}"
            >
              {newAttendance === 'present' ? t('procedure_present_2') : t('procedure_absent')}
            </div>
            <p class="mt-1 text-[10px] text-muted-foreground">
              {t('procedure_attendance_change_explanation', { value1: selectedProposer?.procedure.attendance === 'present'
                ? t('procedure_present_2')
                : t('procedure_absent') })}
            </p>
          </div>
        {:else if selectedType}
          <div class="text-xs text-muted-foreground">{t('procedure_this_motion_will_be_put_to_a_placard_vote')}</div>
        {/if}
      </div>

      <Dialog.Footer class="pt-1">
        <Button variant="outline" onclick={() => (open = false)}>{t('procedure_cancel')}</Button>
        <Button onclick={handlePropose} disabled={!canPropose} class="min-w-[120px] gap-2">
          {t('procedure_submit_motion')}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
