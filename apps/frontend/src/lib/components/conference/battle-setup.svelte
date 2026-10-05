<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { CalendarDate, type DateValue } from '@internationalized/date'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import FreeModeForm from '$lib/components/home/create-battle/free-mode-form.svelte'
  import CampaignModeDialog from '$lib/components/home/create-battle/campaign-mode-dialog.svelte'
  import { createBattle, saveBattlesNow } from '$lib/classes/stores/battle/battle-store'
  import { dbGetAllPlugins, type InstalledPlugin } from '$lib/classes/services/plugin/plugin-db'
  import { isElectron } from '$lib/classes/utils/runtime'

  let { conferenceId, conferenceName, oncreated }: {
    conferenceId: string
    conferenceName: string
    oncreated: () => void
  } = $props()

  let draft = $state({
    name: untrack(() => conferenceName || '大会军事推演'),
    startDate: new CalendarDate(2026, 1, 1) as DateValue | undefined,
    timeScale: 60,
    pixelsPerKm: 10,
    iconStyle: 'nato' as 'nato' | 'simple',
    selectedFaction: null as string | null
  })
  let installedPlugins = $state<InstalledPlugin[]>([])
  let campaignDialogOpen = $state(false)
  let saving = $state(false)
  let error = $state('')
  const factionPlugins = $derived(installedPlugins.filter((plugin) => plugin.manifest.type === 'faction'))
  const campaignPlugins = $derived(installedPlugins.filter((plugin) => plugin.manifest.type === 'campaign'))

  onMount(async () => {
    if (!isElectron()) return
    try {
      installedPlugins = await dbGetAllPlugins()
    } catch {
      error = '无法加载插件，可继续使用基础数据配置推演。'
    }
  })

  async function initialize(name: string, campaignId?: string): Promise<void> {
    if (saving || !name.trim()) return
    if (!Number.isFinite(draft.timeScale) || draft.timeScale <= 0 ||
      !Number.isFinite(draft.pixelsPerKm) || draft.pixelsPerKm < 1 || draft.pixelsPerKm > 500) {
      error = '时间流速必须大于 0，地图比例尺须在 1 至 500 之间。'
      return
    }
    saving = true
    error = ''
    try {
      createBattle(name.trim(), {
        conferenceId,
        startDate: draft.startDate?.toString(),
        timeScale: draft.timeScale,
        pixelsPerKm: draft.pixelsPerKm,
        iconStyle: draft.iconStyle,
        enabledMods: [campaignId ?? draft.selectedFaction ?? 'base'],
        campaignId
      })
      await saveBattlesNow()
      campaignDialogOpen = false
      oncreated()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : '保存推演配置失败，请重试。'
    } finally {
      saving = false
    }
  }
</script>

<div class="mx-auto w-full max-w-xl px-6 py-8">
  <Card.Root>
    <Card.Header>
      <Card.Title>配置大会军事推演</Card.Title>
      <Card.Description>配置将保存到当前大会，下次进入时自动恢复。</Card.Description>
    </Card.Header>
    <Card.Content>
      <FreeModeForm bind:draft {factionPlugins} hasAnyMods={factionPlugins.length > 0}
        onenter={() => void initialize(draft.name)} />
      {#if error}
        <p role="alert" class="text-sm text-destructive">{error}</p>
      {/if}
    </Card.Content>
    <Card.Footer class="flex justify-end gap-2">
      {#if campaignPlugins.length > 0}
        <Button variant="outline" disabled={saving} onclick={() => campaignDialogOpen = true}>
          使用战役包预设
        </Button>
      {/if}
      <Button disabled={saving || !draft.name.trim()} onclick={() => void initialize(draft.name)}>
        {saving ? '正在保存…' : '开始推演'}
      </Button>
    </Card.Footer>
  </Card.Root>
</div>

<CampaignModeDialog bind:open={campaignDialogOpen} {campaignPlugins}
  onclose={() => campaignDialogOpen = false}
  oncreate={(name, campaignId) => void initialize(name, campaignId)} />
