<script lang="ts">
  import { t, getLocale } from '$lib/i18n'
  import PlusIcon from '@lucide/svelte/icons/plus'
  import ClockIcon from '@lucide/svelte/icons/clock'
  import CalendarIcon from '@lucide/svelte/icons/calendar'
  import { goto } from '$app/navigation'
  import { createTimeline } from '$lib/classes/stores/timeline-store'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { Calendar } from '$lib/components/ui/calendar/index.js'
  import { RATIO_PRESETS } from '$lib/classes/services/engine/timeline-engine.svelte'
  import { today, getLocalTimeZone, type CalendarDate } from '@internationalized/date'

  let { open = $bindable(false) }: { open: boolean } = $props()

  // ---- Form state ----
  let name = $state('')
  let selectedDate = $state<CalendarDate | undefined>(undefined)
  let selectedRatio = $state(1)
  let calendarOpen = $state(false)

  // Calendar 年份范围：公元1年～当前年份+50年
  const currentYear = new Date().getFullYear()
  const calendarYears = $state<number[]>(Array.from({ length: currentYear + 50 }, (_, i) => i + 1))

  // ---- 初始化默认时间 ----
  function initDefaults(): void {
    name = ''
    selectedRatio = 1
    calendarOpen = false
    selectedDate = today(getLocalTimeZone())
  }

  function handleOpenChange(value: boolean): void {
    if (value) {
      initDefaults()
    }
    open = value
  }

  function handleCreate(): void {
    const trimmedName = name.trim()
    if (!trimmedName || !selectedDate) return

    const simDate = new Date(selectedDate.year, selectedDate.month - 1, selectedDate.day)
    const simTimeMs = simDate.getTime()
    if (isNaN(simTimeMs)) return

    const id = createTimeline(trimmedName, simTimeMs, selectedRatio)

    open = false
    goto(`/tools/${id}`)
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleCreate()
    }
  }

  const canCreate = $derived(name.trim().length > 0 && selectedDate !== undefined)

  function formatDateLabel(): string {
    if (!selectedDate) return t('components_select_date')
    return selectedDate.toDate(getLocalTimeZone()).toLocaleDateString(getLocale())
  }

  function formatPreview(): string {
    if (!selectedDate) return ''
    const d = selectedDate.toDate(getLocalTimeZone())
    return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(d)
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-lg" onkeydown={handleKeydown}>
      <Dialog.Header class="pb-1">
        <Dialog.Title class="flex items-center gap-2 text-base font-semibold tracking-wide">
          <ClockIcon size={18} class="text-indigo-500" />
          {t('components_new_timeline')}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          {t('components_timeline_description')}
        </Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col gap-4 py-4">
        <!-- 名称 -->
        <div class="flex flex-col gap-1.5">
          <Label for="tl-name" class="text-xs text-muted-foreground">{t('components_timeline_name')}</Label>
          <Input
            id="tl-name"
            bind:value={name}
            placeholder={t('components_timeline_example')}
            class="h-9"
          />
        </div>

        <!-- 初始模拟时间：shadcn Date Picker + 时间输入 -->
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs text-muted-foreground">{t('components_initial_sim_time')}</Label>
          <div class="flex items-center gap-2">
            <Popover.Root bind:open={calendarOpen}>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    class="h-9 w-[180px] justify-between font-normal"
                  >
                    <span class={selectedDate ? '' : 'text-muted-foreground'}>
                      {formatDateLabel()}
                    </span>
                    <CalendarIcon size={15} class="text-muted-foreground" />
                  </Button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content class="w-auto overflow-hidden p-0" align="start">
                <Calendar
                  locale={getLocale()}
                  type="single"
                  bind:value={selectedDate}
                  captionLayout="dropdown"
                  years={calendarYears}
                  onValueChange={() => {
                    calendarOpen = false
                  }}
                />
              </Popover.Content>
            </Popover.Root>
          </div>
          {#if selectedDate}
            <p class="text-xs text-muted-foreground">
              {t('components_date_preview', { date: formatPreview() })}
            </p>
          {/if}
        </div>

        <!-- 初始倍率 -->
        <div class="flex flex-col gap-1.5">
          <Label class="text-xs text-muted-foreground">{t('components_initial_ratio')}</Label>
          <div class="flex flex-wrap gap-1.5">
            {#each RATIO_PRESETS as preset}
              <Button
                size="sm"
                variant={selectedRatio === preset.value ? 'default' : 'outline'}
                onclick={() => (selectedRatio = preset.value)}
              >
                {preset.value === 86400 ? t('components_day_per_second') : preset.value === 3600 ? t('components_hour_per_second') : preset.value === 60 ? t('components_minute_per_second') : `${preset.value}x`}
              </Button>
            {/each}
          </div>
        </div>
      </div>

      <Dialog.Footer class="pt-1">
        <Button variant="outline" onclick={() => (open = false)}>{t('components_cancel')}</Button>
        <Button onclick={handleCreate} disabled={!canCreate} class="min-w-[140px] gap-2">
          <PlusIcon size={15} />
          {t('components_create_timeline')}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
