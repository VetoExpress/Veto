<script lang="ts">
  import { t } from '$lib/i18n'
  import {
    currentBattle,
    currentFaction,
    currentFactionId,
    currentBranch,
    addUnit,
    removeUnit,
    updateUnit,
    updateFaction,
    interactionMode,
    pendingPlaceUnitId
  } from '$lib/classes/stores/battle/battle-store'
  import type { UnitTemplate, UnitSide } from '$lib/classes/types/battle'
  import { registry, mods } from '$lib/classes/services/plugin/mod-registry.svelte'
  import type { CategoryDefinition, ComponentTypeGroup } from '$lib/classes/types/battle'
  import { X, Swords, Pencil, Check } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import BranchSelector from '$lib/components/buttons/branch-selector.svelte'
  import { mapFlyTo } from '$lib/classes/stores/battle/map-store'
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
  } from '$lib/components/ui/card'
  import { runtimePositions } from '$lib/classes/stores/battle/battle-store'
  import UnitListRow from '$lib/components/cards/units/unit-list-row.svelte'

  // 编辑状态
  let editingUnitId = $state<string | null>(null)

  // 阵营信息编辑
  let editingFaction = $state(false)
  let factionEditName = $state('')
  let factionEditColor = $state('')
  let factionEditSide = $state<UnitSide>('blue')

  function startEditFaction() {
    if (!$currentFaction) return
    factionEditName = $currentFaction.name
    factionEditColor = $currentFaction.color
    factionEditSide = $currentFaction.side ?? 'blue'
    editingFaction = true
  }

  function saveEditFaction() {
    if (!$currentFactionId) return
    const name = factionEditName.trim()
    if (!name) return
    updateFaction($currentFactionId, { name, color: factionEditColor, side: factionEditSide })
    editingFaction = false
  }

  $effect(() => {
    // 切换阵营时关闭编辑
    $currentFactionId
    editingFaction = false
    editingUnitId = null
  })

  // ── 注册表衍生数据 ──
  const branchCategories = $derived(mods.getBranchCategories($currentBranch))

  // 新建单位：待选状态
  let pendingCategoryId = $state<string | null>(null)
  let pendingGroupKey = $state<string>('') // 选择的组件分组
  let pendingType = $state<string>('')
  let pendingQuality = $state<string>('')
  let pendingCount = $state(0)

  // ── 辅助函数 ──
  function genId() {
    return crypto.randomUUID()
  }

  let editingUnit = $derived.by(() => {
    if (!editingUnitId || !$currentFaction) return null
    return $currentFaction.units.find((u) => u.id === editingUnitId) ?? null
  })

  /** 选择大类：打开创建面板 */
  function selectUnitCategory(cat: CategoryDefinition) {
    if (pendingCategoryId === cat.id) {
      pendingCategoryId = null
      return
    }
    pendingCategoryId = cat.id
    // 默认选第一个组件分组和类型
    const firstGroup = cat.componentGroups?.[0]
    if (firstGroup) {
      pendingGroupKey = firstGroup.key
      pendingType = firstGroup.types[0] ?? ''
      pendingQuality = firstGroup.qualities[0] ?? ''
      pendingCount = firstGroup.defaultCount
    }
  }

  /** 确认创建单位（携带初始组件） */
  function confirmCreateUnit() {
    console.log('Confirm create unit with:', {
      categoryId: pendingCategoryId,
      groupKey: pendingGroupKey,
      type: pendingType,
      quality: pendingQuality,
      count: pendingCount
    })
    const faction = $currentFaction
    if (!faction || !$currentFactionId || !pendingCategoryId) return
    const cat = mods.get_categories().get(pendingCategoryId)
    console.log('Found category for ID', pendingCategoryId, ':', cat)
    if (!cat) return

    const categoryLabel = mods.getLabel('category.' + cat.id, cat.id)
    const existCount = faction.units.filter((u) => u.categoryId === cat.id).length
    const name = `${categoryLabel}${existCount + 1}`
    const id = genId()

    const defaultStats: Record<string, number> = {
      maxHp: 100,
      maxOrg: 80,
      softAttack: 20,
      hardAttack: 10,
      airAttack: 0,
      defense: 20,
      speed: 10,
      attackRange: 5,
      hardness: 0.1
    }

    const unit: UnitTemplate = {
      id,
      name,
      branchId: $currentBranch,
      categoryId: pendingCategoryId,
      stats: { ...defaultStats },
      components:
        pendingGroupKey && pendingType
          ? {
              [pendingGroupKey]: [
                {
                  id: genId(),
                  type: pendingType,
                  quality: pendingQuality || 'basic',
                  count: pendingCount || 1
                }
              ]
            }
          : {}
    }

    addUnit($currentFactionId, unit)
    editingUnitId = id
    pendingCategoryId = null
  }

  // 重命名单位
  function renameUnit(unitId: string, name: string) {
    if (!$currentFactionId) return
    updateUnit($currentFactionId, unitId, (u) => ({ ...u, name }))
  }

  /** 为正在编辑的单位追加一个组件条目 */
  function addComponentEntry(groupKey: string, type: string, quality: string, count: number) {
    if (!$currentFactionId || !editingUnitId) return
    updateUnit($currentFactionId, editingUnitId, (u) => {
      const existing = u.components?.[groupKey] ?? []
      return {
        ...u,
        components: {
          ...u.components,
          [groupKey]: [...existing, { id: genId(), type, quality, count }]
        }
      }
    })
  }

  /** 删除组件条目 */
  function removeComponent(compId: string) {
    if (!$currentFactionId || !editingUnitId) return
    updateUnit($currentFactionId, editingUnitId, (u) => {
      const newComponents: Record<string, import('$lib/classes/types/battle').ComponentEntry[]> = {}
      for (const [key, entries] of Object.entries(u.components ?? {})) {
        newComponents[key] = entries.filter((e) => e.id !== compId)
      }
      return { ...u, components: newComponents }
    })
  }

  // 在地图上放置单位
  function handlePlaceUnit(unitId: string) {
    pendingPlaceUnitId.set(unitId)
    interactionMode.set('place')
  }

  // 获取当前编辑单位的大类定义
  const editingUnitCat = $derived.by(() => {
    if (!editingUnit) return null
    return [...mods.get_categories().values()].find((c) => c.id === editingUnit.categoryId) ?? null
  })

  // 用于追加组件的临时状态
  let addCompGroupKey = $state('')
  let addCompType = $state('')
  let addCompQuality = $state('')
  let addCompCount = $state(1)

  $effect(() => {
    const firstGroup = editingUnitCat?.componentGroups?.[0]
    if (firstGroup) {
      addCompGroupKey = firstGroup.key
      addCompType = firstGroup.types[0] ?? ''
      addCompQuality = firstGroup.qualities[0] ?? ''
      addCompCount = firstGroup.defaultCount
    }
  })
</script>

<Card class="veto-sidebar absolute z-[100] h-full w-[24rem] gap-0">
  <CardHeader class="border-b px-5 py-4">
    <CardTitle class="flex items-center gap-2 text-sm font-semibold tracking-wide">
      <Swords class="size-4" />{t('components_military_units')}
      <Button
        variant="ghost"
        size="icon"
        class="ml-auto size-6 shrink-0 text-muted-foreground hover:text-foreground"
        title={t('components_close')}
        onclick={() => currentFactionId.set(null)}
      >
        <X class="size-3.5" />
      </Button>
    </CardTitle>

    {#if $currentFaction}
      {#if editingFaction}
        <!-- 编辑模式 -->
        <div class="mt-2 space-y-2">
          <div class="flex items-center gap-2">
            <div
              class="h-4 w-4 shrink-0 rounded-full ring-2 ring-background"
              style:background-color={factionEditColor}
            ></div>
            <Input
              class="h-7 flex-1 text-xs"
              bind:value={factionEditName}
              placeholder={t('components_faction_name')}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') saveEditFaction()
                if (e.key === 'Escape') editingFaction = false
              }}
            />
          </div>
          <div class="flex items-center gap-2">
            <Label class="shrink-0 text-xs text-muted-foreground">{t('components_color')}</Label>
            <input
              type="color"
              bind:value={factionEditColor}
              class="h-7 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
            />
          </div>
          <div class="flex items-center gap-2">
            <Label class="shrink-0 text-xs text-muted-foreground">{t('components_side')}</Label>
            <div class="flex gap-1.5">
              {#each [{ v: 'blue', l: t('components_blue_side'), c: '#1d4ed8' }, { v: 'red', l: t('components_red_side'), c: '#dc2626' }, { v: 'neutral', l: t('components_neutral_side'), c: '#16a34a' }] as opt}
                <button
                  type="button"
                  class="rounded border px-2 py-0.5 text-[11px] font-medium transition-all {factionEditSide ===
                  opt.v
                    ? 'border-transparent text-white'
                    : 'border-stone-200 text-stone-500 hover:border-stone-400 dark:border-stone-600 dark:text-stone-400 dark:hover:border-stone-400'}"
                  style={factionEditSide === opt.v ? `background:${opt.c}` : ''}
                  onclick={() => (factionEditSide = opt.v)}>{opt.l}</button
                >
              {/each}
            </div>
          </div>
          <div class="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs text-muted-foreground"
              onclick={() => (editingFaction = false)}
            >
              <X class="mr-1 size-3" />{t('components_cancel')}
            </Button>
            <Button
              size="sm"
              class="h-7 px-2 text-xs"
              onclick={saveEditFaction}
              disabled={!factionEditName.trim()}
            >
              <Check class="mr-1 size-3" />{t('components_save')}
            </Button>
          </div>
        </div>
      {:else}
        <!-- 展示模式 -->
        <div class="mt-1.5 flex items-center justify-between">
          <div class="flex min-w-0 items-center gap-2">
            <span
              class="h-3 w-3 shrink-0 rounded-full ring-2 ring-background"
              style:background-color={$currentFaction.color}
            ></span>
            <span class="truncate text-xs text-muted-foreground">{$currentFaction.name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            title={t('components_edit_faction')}
            onclick={startEditFaction}
          >
            <Pencil class="size-3" />
          </Button>
        </div>
      {/if}
    {:else}
      <CardDescription class="text-xs text-muted-foreground">{t('components_deploy_units')}</CardDescription>
    {/if}
  </CardHeader>
  <CardContent class="sidebar-body overflow-y-auto px-4 py-4">
    <div class="space-y-3">
      <div class="space-y-2">
        {#if !$currentFaction}
          <p class="py-4 text-center text-xs text-muted-foreground">{t('components_select_faction_first')}</p>
        {:else}
          <!-- 军种选择（注册表驱动，自动包含所有军种，包括 Mod 添加的） -->
          <BranchSelector
            value={$currentBranch}
            onchange={(b) => {
              currentBranch.set(b)
              editingUnitId = null
              pendingCategoryId = null
            }}
          />

          <!-- 选择单位大类（注册表动态枚举） -->
          <div class="grid grid-cols-3 gap-1">
            {#each branchCategories as cat (cat.id)}
              <button
                class="flex items-center justify-center rounded-md border py-1.5 text-xs font-medium transition-all {pendingCategoryId ===
                cat.id
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'}"
                onclick={() => selectUnitCategory(cat)}
              >
                {mods.getLabel('category.' + cat.id, cat.id)}
              </button>
            {/each}
          </div>

          <!-- 新建单位面板（注册表驱动的类型/质量选择） -->
          {#if pendingCategoryId !== null}
            {@const cat = [...mods.get_categories().values()].find(
              (c) => c.id === pendingCategoryId
            )}
            {#if cat}
              <div class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                {#each cat.componentGroups ?? [] as group (group.key)}
                  <p class="text-xs font-medium text-muted-foreground">
                    {t('components_select_category', { category: mods.getLabel('category.' + cat.id, cat.id) })}
                  </p>
                  <div class="grid grid-cols-2 gap-1">
                    {#each group.types as typeId}
                      <button
                        class="rounded-md border py-1.5 text-xs font-medium transition-all {pendingType ===
                        typeId
                          ? 'border-transparent bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'}"
                        onclick={() => {
                          pendingGroupKey = group.key
                          pendingType = typeId
                        }}
                      >
                        {mods.getLabel('type.' + group.key + '.' + typeId, typeId)}
                      </button>
                    {/each}
                  </div>
                  <p class="text-xs font-medium text-muted-foreground">{t('components_quality')}</p>
                  <div class="grid grid-cols-3 gap-1">
                    {#each group.qualities as qualityId}
                      <button
                        class="rounded-md border py-1 text-[11px] font-medium transition-all {pendingQuality ===
                        qualityId
                          ? 'border-transparent bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'}"
                        onclick={() => (pendingQuality = qualityId)}
                      >
                        {mods.getLabel('quality.' + qualityId, qualityId)}
                      </button>
                    {/each}
                  </div>
                {/each}
                <div class="flex items-center gap-2">
                  <span class="shrink-0 text-xs text-muted-foreground">{t('components_quantity')}</span>
                  <Input
                    type="number"
                    bind:value={pendingCount}
                    min={1}
                    max={100000}
                    class="h-7 flex-1 text-xs"
                  />
                </div>
                <div class="flex justify-end gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs text-muted-foreground"
                    onclick={() => (pendingCategoryId = null)}
                  >
                    <X class="mr-1 size-3" />{t('components_cancel')}
                  </Button>
                  <Button size="sm" class="h-7 px-2 text-xs" onclick={confirmCreateUnit}>
                    <Check class="mr-1 size-3" />{t('components_create')}
                  </Button>
                </div>
              </div>
            {/if}
          {/if}

          <!-- 已有单位列表 -->
          <ScrollArea class="h-[full]">
            <div class="flex flex-col gap-0.5 pr-2">
              {#each $currentFaction.units.filter((u) => u.branchId === $currentBranch) as unit (unit.id)}
                {@const placed = $currentBattle?.placedUnits.find(
                  (p) => p.unitId === unit.id && p.factionId === $currentFactionId
                )}
                {@const runtimePos = placed ? $runtimePositions[placed.id] : undefined}
                <UnitListRow
                  {unit}
                  isSelected={editingUnitId === unit.id}
                  {placed}
                  {runtimePos}
                  onSelect={() => {
                    editingUnitId = editingUnitId === unit.id ? null : unit.id
                  }}
                  onLocate={() => {
                    if (placed) mapFlyTo.set({ lat: placed.lat, lng: placed.lng })
                  }}
                  onPlace={() => handlePlaceUnit(unit.id)}
                  onDelete={() => {
                    removeUnit($currentFactionId!, unit.id)
                    if (editingUnitId === unit.id) editingUnitId = null
                  }}
                  onRename={(name) => renameUnit(unit.id, name)}
                />
              {/each}
              {#if $currentFaction.units.filter((u) => u.branchId === $currentBranch).length === 0}
                <p class="py-4 text-center text-xs text-muted-foreground">
                  {t('components_no_units')}
                </p>
              {/if}
            </div>
          </ScrollArea>
        {/if}
      </div>
    </div>
  </CardContent>
</Card>
