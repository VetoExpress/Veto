<script lang="ts">
  import { t } from '$lib/i18n'
  import { tick, untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { ArrowLeft, ArrowRight, Check } from '@lucide/svelte'
  import { getCreatedConferenceById } from '$lib/classes/stores/conference/conference-event-store'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Tabs from '$lib/components/ui/tabs'
  import StepInfo from './step-info.svelte'
  import StepMeetings from './step-meetings.svelte'
  import StepMode from './step-mode.svelte'
  import StepReview from './step-review.svelte'
  import StepSeats from './step-seats.svelte'
  import { getWizardSteps } from './steps'
  import { cloudPlatformView } from '$lib/classes/stores/app/cloud-platform-view.svelte'

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

  // 进入页面时定位到第一个未完成步骤；untrack 避免向导数据变化时重新定位
  $effect(() => {
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

  // 步骤切换后清除上一页留下的“已尝试”错误态
  $effect(() => {
    if (currentStepId) wizard.attempted = false
  })

  function focusFirstInvalid(): void {
    // 等错误文案渲染后再聚焦第一个无效控件
    void tick().then(() => {
      contentEl?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    })
  }

  /** 校验当前步并通过后切换到 targetIndex；未通过则原地标错（“下一步”专用） */
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

  async function handleNext(): Promise<void> {
    if (wizard.mode === 'conference') {
      if (!wizard.modeValid) {
        wizard.attempted = true
        focusFirstInvalid()
        return
      }
      wizard.reset()
      await goto(resolve('/conference'))
      cloudPlatformView.open()
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
    const committeeId = event?.committees[0]?.id
    if (event && committeeId && event.mode === 'singleton') {
      void goto(resolve(`/client/${event.id}/committee/${committeeId}/chair`))
      return
    }
    void goto(resolve(event && committeeId ? `/client/${event.id}/committee/${committeeId}` : '/'))
  }
</script>

<div class="create-conference-layout">
  <aside class="create-conference-steps">
    <div class="mb-4 flex items-center justify-between gap-3 px-3">
      <p class="eyebrow">{t('procedure_creation_progress')}</p>
      <span class="text-xs tabular-nums text-muted-foreground">
        {currentIndex + 1} / {visibleSteps.length}
      </span>
    </div>

    <Tabs.Root
      bind:value={currentStepId}
      orientation="vertical"
      class="flex-col gap-1"
    >
      <Tabs.List
        class="w-full flex-row gap-2 overflow-x-auto rounded-none bg-transparent p-0 md:flex-col md:overflow-visible"
      >
        {#each visibleSteps as step, index (step.id)}
          {@const Icon = step.icon}
          {@const completed =
            index <= currentIndex &&
            index < visibleSteps.length - 1 &&
            wizard.isStepValidById(step.id)}
          <Tabs.Trigger
            value={step.id}
            disabled={index > currentIndex && !canAdvance}
            class="h-auto min-w-fit justify-start gap-2.5 px-3 py-2.5 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm md:w-full"
          >
            <Icon class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate text-left">{step.title}</span>
            {#if completed}<Check class="size-3.5 shrink-0 text-emerald-500" />{/if}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </Tabs.Root>
  </aside>

  <section class="surface-card min-w-0 overflow-clip rounded-2xl border bg-card">
    <header class="border-b px-5 py-4 sm:px-6">
      <p class="eyebrow">
        {t('procedure_creation_progress')} · {currentIndex + 1}
      </p>
      <h2 class="mt-1 text-lg font-semibold tracking-tight">{currentStep?.title}</h2>
    </header>

    <div bind:this={contentEl} class="create-step-content min-h-[28rem] p-5 sm:p-6">
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
        <div class="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
          <h2 class="text-base font-semibold">
            {t('procedure_create_conference_on_the_veto_platform')}
          </h2>
          <p class="text-sm text-muted-foreground">
            {t('procedure_click_next_to_open_the_veto_platform')}
          </p>
        </div>
      {/if}
    </div>

    <footer
      class="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card/95 px-5 py-4 backdrop-blur sm:px-6"
    >
      {#if currentIndex === 0}
        <Button variant="ghost" href={resolve('/conference')} disabled={wizard.creating}>
          <ArrowLeft data-icon="inline-start" />
          {t('procedure_workspace')}
        </Button>
      {:else}
        <Button
          variant="ghost"
          disabled={wizard.creating}
          onclick={() => {
            const prev = visibleSteps[currentIndex - 1]
            if (prev) currentStepId = prev.id
          }}
        >
          <ArrowLeft data-icon="inline-start" />
          {t('procedure_previous')}
        </Button>
      {/if}

      {#if !isLastStep || wizard.mode === 'conference'}
        <Button disabled={wizard.creating} onclick={() => void handleNext()}>
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
    </footer>
  </section>
</div>

<style>
  .create-conference-layout {
    display: grid;
    min-width: 0;
    gap: 1rem;
  }

  .create-conference-steps {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: color-mix(in oklch, var(--muted) 58%, transparent);
    padding: 0.75rem;
  }

  .create-step-content {
    min-width: 0;
  }

  .eyebrow {
    color: var(--muted-foreground);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  @media (min-width: 900px) {
    .create-conference-layout {
      grid-template-columns: 15rem minmax(0, 1fr);
      align-items: start;
      gap: 1.25rem;
    }

    .create-conference-steps {
      position: sticky;
      top: 1.5rem;
    }
  }
</style>
