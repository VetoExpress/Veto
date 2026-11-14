<script lang="ts">
  import { t } from '$lib/i18n'
  import { tick, untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { ArrowLeft, ArrowRight, Check, X } from '@lucide/svelte'
  import { getCreatedConferenceById } from '$lib/classes/stores/conference/conference-event-store'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Tabs from '$lib/components/ui/tabs'
  import StepInfo from './step-info.svelte'
  import StepMeetings from './step-meetings.svelte'
  import StepMode from './step-mode.svelte'
  import StepReview from './step-review.svelte'
  import StepSeats from './step-seats.svelte'
  import { getWizardSteps } from './steps'
  import { createConferenceDialogOpen } from '$lib/classes/stores/app/global-ui-store'

  let { open = $bindable(false) }: { open: boolean } = $props()

  const cloudPlatformUrl = 'https://platform.miaoyww.top/?from=app'

  let contentEl = $state<HTMLDivElement | undefined>(undefined)
  let currentStepId = $state<string>('mode')

  const visibleSteps = $derived(getWizardSteps(wizard.mode))
  const currentIndex = $derived(
    Math.max(
      0,
      visibleSteps.findIndex((step) => step.id === currentStepId)
    )
  )
  const currentStep = $derived(visibleSteps[currentIndex])
  const isLastStep = $derived(currentIndex === visibleSteps.length - 1)
  const canAdvance = $derived(currentStep != null && wizard.isStepValidById(currentStep.id))

  // 打开时定位到第一个未完成步骤；untrack 避免向导数据变化时重新定位
  $effect(() => {
    if (!open) return
    untrack(() => {
      const steps = getWizardSteps(wizard.mode)
      const target =
        steps.find((step) => !wizard.isStepValidById(step.id)) ?? steps[steps.length - 1]
      currentStepId = target.id
      wizard.attempted = false
    })
  })

  // 云端大会只保留模式选择与进入平台
  $effect(() => {
    if (wizard.mode === 'conference' && currentStepId !== 'mode' && currentStepId !== 'platform') {
      currentStepId = 'mode'
    }
  })

  // 步骤切换后清除上一页留下的"已尝试"错误态
  $effect(() => {
    if (currentStepId) wizard.attempted = false
  })

  function focusFirstInvalid(): void {
    // 等错误文案渲染后再聚焦第一个无效控件
    void tick().then(() => {
      contentEl?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    })
  }

  /** 校验当前步并通过后切换到 targetIndex；未通过则原地标错（"下一步"专用） */
  function tryAdvance(targetIndex: number): void {
    const step = visibleSteps[currentIndex]
    const target = visibleSteps[targetIndex]
    if (!step || !target || !wizard.isStepValidById(step.id)) {
      wizard.attempted = true
      focusFirstInvalid()
      return
    }
    currentStepId = target.id
  }

  function handleNext(): void {
    if (wizard.mode === 'conference') {
      if (!wizard.modeValid) {
        wizard.attempted = true
        focusFirstInvalid()
        return
      }
      window.location.replace(cloudPlatformUrl)
      return
    }
    if (isLastStep) return
    tryAdvance(Math.min(currentIndex + 1, visibleSteps.length - 1))
  }

  async function handleSubmit(): Promise<void> {
    if (wizard.creating) return
    const eventId = await wizard.submit()
    if (!eventId) return
    // 落地大会总览页，并进入第一个委员会。
    const event = getCreatedConferenceById(eventId)
    wizard.reset()
    open = false
    const committeeId = event?.committees[0]?.id
    if (event && committeeId && event.mode === 'singleton') {
      void goto(resolve(`/client/${event.id}/committee/${committeeId}/chair`))
      return
    }
    void goto(resolve(event && committeeId ? `/client/${event.id}/committee/${committeeId}` : '/'))
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="w-[1024px] max-w-[calc(100vw-40px)] sm:max-w-[1024px] sm:max-h-[85vh]"
    showCloseButton={false}
  >
    <Button
      class="absolute end-4 top-4 z-10 opacity-70 transition-opacity hover:opacity-100"
      variant="ghost"
      size="icon"
      onclick={() => createConferenceDialogOpen.set(false)}
    >
      <X size={18} />
    </Button>

    <Dialog.Header>
      <div class="flex flex-col items-start justify-between">
        <div class="min-w-0">
          <Dialog.Title>{t('procedure_create_conference')}</Dialog.Title>
          <Dialog.Description>
            {#if wizard.mode === 'conference'}
              {t('procedure_click_next_to_open_the_veto_platform')}
            {:else if wizard.mode === 'singleton'}
              {t('procedure_configure_one_independently_chaired_meeting_and_its_seats')}
            {:else}
              {t('procedure_configure_the_conference_committees_roles_capabilities_and_seats')}
            {/if}
          </Dialog.Description>
        </div>

        <Tabs.Root bind:value={currentStepId}>
          <Tabs.List class="flex-row flex-wrap">
            {#each visibleSteps as step, index (step.id)}
              {@const Icon = step.icon}
              {@const completed =
                index <= currentIndex &&
                index < visibleSteps.length - 1 &&
                wizard.isStepValidById(step.id)}
              <Tabs.Trigger value={step.id} disabled={index > currentIndex && !canAdvance}>
                <Icon class="size-3.5 shrink-0" />
                <span class="min-w-0 truncate">{step.title}</span>
                {#if completed}<Check class="size-3 shrink-0 text-emerald-500" />{/if}
              </Tabs.Trigger>
            {/each}
          </Tabs.List>
        </Tabs.Root>
      </div>
    </Dialog.Header>

    <div bind:this={contentEl} class="create-step-scroll max-h-[55vh] overflow-y-auto pr-1">
      <div class="create-step-surface">
        {#if currentStep?.id === 'mode'}
          <StepMode />
        {:else if currentStep?.id === 'event'}
          <StepInfo />
        {:else if currentStep?.id === 'meeting'}
          <StepMeetings />
        {:else if currentStep?.id === 'seats'}
          <StepSeats />
        {:else if currentStep?.id === 'review'}
          <StepReview />
        {:else if currentStep?.id === 'platform'}
          <div class="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
            <h2 class="text-base font-semibold">
              {t('procedure_create_conference_on_the_veto_platform')}
            </h2>
            <p class="text-sm text-muted-foreground">
              {t('procedure_click_next_to_open_the_veto_platform')}
            </p>
          </div>
        {/if}
      </div>
    </div>

    <Dialog.Footer class="sm:justify-between">
      <Button
        variant="ghost"
        disabled={currentIndex === 0 || wizard.creating}
        onclick={() => {
          const prev = visibleSteps[currentIndex - 1]
          if (prev) currentStepId = prev.id
        }}
      >
        <ArrowLeft data-icon="inline-start" />
        {t('procedure_previous')}
      </Button>
      {#if !isLastStep || wizard.mode === 'conference'}
        <Button disabled={wizard.creating} onclick={handleNext}>
          {t('procedure_next')}
          <ArrowRight data-icon="inline-end" />
        </Button>
      {:else}
        <Button disabled={wizard.creating} onclick={() => void handleSubmit()}>
          {#if wizard.creating}
            {t('procedure_creating')}
          {:else}
            {t('procedure_create_conference')}
          {/if}
          <Check data-icon="inline-end" />
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .create-step-surface {
    min-height: 12rem;
    border: 1px solid color-mix(in oklch, var(--border) 80%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in oklch, var(--card) 78%, transparent);
    padding: 1.25rem;
  }
</style>
