<script lang="ts">
  import { ChevronDown, FileSpreadsheet, FileText, Plus, Trash2, Upload } from '@lucide/svelte'
  import { cn } from '$lib/classes/utils'
  import { Button } from '$lib/components/ui/button'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { Textarea } from '$lib/components/ui/textarea'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import {
    SeatImportError,
    parseSeatText,
    readSeatWorkbook,
    type ImportedSeat,
    type SeatWorkbook
  } from '@vetoexpress/utils/seat-import'

  type ImportMode = 'excel' | 'text'

  const isSingleton = $derived(wizard.mode === 'singleton')

  let formatDialogOpen = $state(false)
  let textDialogOpen = $state(false)
  let sheetDialogOpen = $state(false)
  let previewDialogOpen = $state(false)
  let importMode = $state<ImportMode>('excel')
  let textValue = $state('')
  let importError = $state('')
  let selectedSheet = $state('')
  let targetCommitteeId = $state('')
  let importedRows = $state<ImportedSeat[]>([])
  let workbook = $state<SeatWorkbook | null>(null)
  let fileInput = $state<HTMLInputElement | undefined>(undefined)
  let collapsedCommittees = $state<Record<string, boolean>>({})

  const showInvalidRole = $derived(
    !isSingleton &&
      wizard.attempted &&
      wizard.roles.length > 0 &&
      wizard.committees.some((committee) =>
        committee.seats.some((seat) => !wizard.roles.some((role) => role.id === seat.roleId))
      )
  )

  const hasUnmatchedImportedRole = $derived(
    !isSingleton &&
      importedRows.some((row) => row.roleName && !roleIdForType(row.roleName, targetCommitteeId))
  )
  const targetCommittee = $derived(
    wizard.committees.find((committee) => committee.id === targetCommitteeId)
  )

  function openFormatDialog(mode: ImportMode, committeeId: string): void {
    targetCommitteeId = committeeId
    textValue = ''
    importedRows = []
    workbook = null
    importMode = mode
    importError = ''
    formatDialogOpen = true
  }

  function confirmFormatDialog(): void {
    formatDialogOpen = false
    importError = ''
    if (importMode === 'excel') {
      fileInput?.click()
    } else {
      textDialogOpen = true
    }
  }

  async function handleExcelFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      workbook = readSeatWorkbook(await file.arrayBuffer())
      selectedSheet = workbook.sheetNames[0]
      sheetDialogOpen = true
    } catch (error) {
      importError = importErrorMessage(error, 'Excel 文件读取失败')
      formatDialogOpen = true
    }
  }

  function readSelectedSheet(): void {
    if (!workbook || !selectedSheet) return
    try {
      importedRows = workbook.importSheet(selectedSheet, isSingleton ? 'singleton' : 'conference')
      sheetDialogOpen = false
      openPreview()
    } catch (error) {
      importError = importErrorMessage(error, '没有读取到有效数据，请检查表格内容')
    }
  }

  function importErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof SeatImportError))
      return error instanceof Error ? error.message : fallback
    if (error.code === 'empty_workbook') return '文件中没有可读取的 sheet'
    if (error.code === 'sheet_not_found') return '找不到所选 Sheet'
    if (error.code === 'no_valid_rows') return fallback
    return fallback
  }

  function readText(): void {
    try {
      importedRows = parseSeatText(textValue, isSingleton ? 'singleton' : 'conference')
      textDialogOpen = false
      openPreview()
    } catch (error) {
      importError = importErrorMessage(error, '没有读取到有效数据，请按格式逐行输入')
    }
  }

  function openPreview(): void {
    previewDialogOpen = true
  }

  function roleIdForType(type: string, committeeId: string): string {
    if (isSingleton) return ''
    const committee = wizard.committees.find((item) => item.id === committeeId)
    if (!committee) return ''
    const normalized = type.replace(/\s+/g, '').toLowerCase()
    if (!normalized) {
      return (
        wizard.roles.find((role) => wizard.isRoleAllowedInCommittee(role.id, committee.type))?.id ??
        ''
      )
    }
    return (
      wizard.roles.find(
        (role) =>
          role.name.replace(/\s+/g, '').toLowerCase() === normalized &&
          wizard.isRoleAllowedInCommittee(role.id, committee.type)
      )?.id ?? ''
    )
  }

  function matchedRoleName(row: ImportedSeat): string {
    if (isSingleton) return row.hasVotingRights === false ? '无投票权' : '有投票权'

    const roleId = roleIdForType(row.roleName ?? '', targetCommitteeId)
    return roleId ? wizard.roleName(roleId) : row.roleName ? '未匹配角色' : '自动匹配'
  }

  function confirmImport(): void {
    if (!targetCommittee || importedRows.length === 0) return
    wizard.addImportedSeats(
      targetCommitteeId,
      importedRows.map((row) =>
        isSingleton
          ? {
              name: row.name,
              shortName: row.shortName,
              hasVotingRights: row.hasVotingRights ?? true
            }
          : {
              name: row.name,
              shortName: row.shortName,
              roleId: roleIdForType(row.roleName ?? '', targetCommitteeId)
            }
      )
    )
    previewDialogOpen = false
    collapsedCommittees[targetCommitteeId] = false
    importedRows = []
    importError = ''
  }
</script>

<input
  bind:this={fileInput}
  class="hidden"
  type="file"
  accept=".xlsx,.xls,.csv"
  onchange={(event) => void handleExcelFile(event)}
/>

<section class="flex flex-col gap-4">
  {#each wizard.committees as committee (committee.id)}
    {@const showNoSeats = wizard.attempted && committee.seats.length === 0}
    {@const showInvalidSpecialRole =
      !isSingleton &&
      wizard.attempted &&
      committee.seats.some(
        (seat) =>
          Boolean(seat.roleId) &&
          !wizard.isRoleAllowedInCommittee(seat.roleId ?? '', committee.type)
      )}
    <article class="rounded-lg border p-4">
      <Collapsible.Root
        open={!collapsedCommittees[committee.id]}
        onOpenChange={(open) => (collapsedCommittees[committee.id] = !open)}
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <h2 class="truncate text-sm font-semibold">{committee.name || '未命名委员会'}</h2>
            <span class="text-sm text-muted-foreground">{committee.seats.length} 个席位</span>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  aria-label={`${collapsedCommittees[committee.id] ? '展开' : '折叠'}${committee.name || '未命名委员会'}席位`}
                >
                  <ChevronDown
                    class={cn(
                      'transition-transform',
                      !collapsedCommittees[committee.id] && 'rotate-180'
                    )}
                  />
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onclick={() => openFormatDialog('excel', committee.id)}
            >
              <FileSpreadsheet data-icon="inline-start" />从 Excel 导入
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => openFormatDialog('text', committee.id)}
            >
              <FileText data-icon="inline-start" />从文本导入
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => {
                wizard.addSeat(committee.id)
                collapsedCommittees[committee.id] = false
              }}
            >
              <Plus data-icon="inline-start" />
              添加席位
            </Button>
          </div>
        </div>

        <Collapsible.Content>
          <div class="mt-3 flex flex-col gap-2">
            {#each committee.seats as seat (seat.id)}
              {@const showSeatNameError = wizard.attempted && seat.name.trim().length === 0}
              <div class="flex flex-col gap-1">
                <div
                  class={cn(
                    'grid items-center gap-2',
                    isSingleton
                      ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_9rem_2.5rem]'
                      : committee.type === 'cabinet'
                        ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_15rem_2.5rem]'
                        : 'md:grid-cols-[minmax(0,1fr)_15rem_2.5rem]'
                  )}
                >
                  <Input
                    bind:value={seat.name}
                    placeholder="席位名称"
                    aria-label="席位名称"
                    aria-invalid={showSeatNameError || undefined}
                  />
                  {#if committee.type === 'cabinet'}
                    <Input
                      bind:value={seat.shortName}
                      placeholder="席位简称（可选）"
                      aria-label="席位简称"
                    />
                  {/if}
                  {#if isSingleton}
                    <label
                      class="flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs text-muted-foreground"
                    >
                      <Checkbox bind:checked={seat.hasVotingRights} aria-label="投票权" />
                      投票权
                    </label>
                  {:else}
                    <Select.Select type="single" bind:value={seat.roleId}>
                      <Select.SelectTrigger class="w-full" aria-label="角色">
                        {wizard.roleName(seat.roleId ?? '')}
                      </Select.SelectTrigger>
                      <Select.SelectContent>
                        {#each wizard.roles as role (role.id)}
                          {#if wizard.isRoleAllowedInCommittee(role.id, committee.type)}
                            <Select.SelectItem value={role.id} label={role.name || '未命名角色'} />
                          {/if}
                        {/each}
                      </Select.SelectContent>
                    </Select.Select>
                  {/if}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="删除席位"
                    onclick={() => wizard.removeSeat(committee.id, seat.id)}
                  >
                    <Trash2 class="text-destructive" />
                  </Button>
                </div>
                {#if showSeatNameError}
                  <Field.FieldError>请输入席位名称</Field.FieldError>
                {/if}
              </div>
            {:else}
              <p
                class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
              >
                尚未分配席位
              </p>
            {/each}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {#if showNoSeats}
        <Field.FieldError class="mt-1">每个委员会至少分配一个席位</Field.FieldError>
      {/if}
      {#if showInvalidRole}
        <Field.FieldError class="mt-1">存在未匹配到角色的席位，请重新选择角色</Field.FieldError>
      {/if}
      {#if showInvalidSpecialRole}
        <Field.FieldError class="mt-1">
          当前席位的角色与会场类型不匹配，请重新选择角色或调整会场类型
        </Field.FieldError>
      {/if}
    </article>
  {/each}
</section>

<Dialog.Root bind:open={formatDialogOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{importMode === 'excel' ? '从 Excel 导入席位' : '从文本导入席位'}</Dialog.Title>
      <Dialog.Description>开始读取前，请确认导入内容符合以下格式。</Dialog.Description>
    </Dialog.Header>
    {#if importMode === 'excel'}
      <div class="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>第一行作为表头，从第二行开始读取：</p>
        <div class="overflow-hidden rounded-md border">
          <table class="w-full text-sm">
            <thead class="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium">A 列</th>
                <th class="px-3 py-2 font-medium">B 列（可选）</th>
                <th class="px-3 py-2 font-medium">C 列（可选）</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-t">
                <td class="px-3 py-2">席位名称</td>
                <td class="px-3 py-2">席位简称（可选）</td>
                <td class="px-3 py-2">
                  {isSingleton ? '投票权（可选，默认为是）' : '席位类型（角色名称，可选）'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>选择文件后还需要选择要读取的 sheet。</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>每行一个席位，格式为：</p>
        <code class="rounded-md bg-muted px-3 py-2 text-foreground">
          {isSingleton ? '席位名称[,席位简称][,投票权]' : '席位名称[,席位简称][,席位类型]'}
        </code>
        <p>
          {isSingleton
            ? '席位简称和投票权都可以省略；投票权填"否"表示无投票权，其他留空或取值默认为有投票权。'
            : '席位简称和席位类型都可以省略；需要跳过简称填写类型时，请保留空字段，例如：席位名称,,席位类型。'}
        </p>
        <p>分隔符支持逗号、中文逗号、分号、中文分号和 |。</p>
      </div>
    {/if}
    {#if importError}<Field.FieldError>{importError}</Field.FieldError>{/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (formatDialogOpen = false)}>取消</Button>
      <Button onclick={confirmFormatDialog}>
        <Upload data-icon="inline-start" />
        {importMode === 'excel' ? '选择文件' : '继续输入'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={textDialogOpen}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>粘贴文本席位</Dialog.Title>
      <Dialog.Description>每行一个席位，支持逗号、分号或 | 分隔。</Dialog.Description>
    </Dialog.Header>
    <Textarea
      bind:value={textValue}
      rows={10}
      placeholder={isSingleton ? '席位名称[,席位简称][,投票权]' : '席位名称[,席位简称][,席位类型]'}
    />
    {#if importError}<Field.FieldError>{importError}</Field.FieldError>{/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (textDialogOpen = false)}>取消</Button>
      <Button onclick={readText}>读取并预览</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={sheetDialogOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>选择 Sheet</Dialog.Title>
      <Dialog.Description>请选择要读取的工作表，第一行将作为表头跳过。</Dialog.Description>
    </Dialog.Header>
    <Select.Select type="single" bind:value={selectedSheet}>
      <Select.SelectTrigger class="w-full" aria-label="工作表">
        {selectedSheet || '选择工作表'}
      </Select.SelectTrigger>
      <Select.SelectContent>
        {#each workbook?.sheetNames ?? [] as sheet}<Select.SelectItem
            value={sheet}
            label={sheet}
          />{/each}
      </Select.SelectContent>
    </Select.Select>
    {#if importError}<Field.FieldError>{importError}</Field.FieldError>{/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (sheetDialogOpen = false)}>取消</Button>
      <Button disabled={!selectedSheet} onclick={readSelectedSheet}>读取并预览</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={previewDialogOpen}>
  <Dialog.Content class="max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>导入数据预览</Dialog.Title>
      <Dialog.Description>
        确认后将把以下 {importedRows.length} 条席位追加到当前会场。
      </Dialog.Description>
    </Dialog.Header>
    <p class="text-sm text-muted-foreground">导入到：{targetCommittee?.name || '未命名委员会'}</p>
    <div class="max-h-[50vh] overflow-auto rounded-md border">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-muted/90 text-left text-xs text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">席位名称</th>
            <th class="px-3 py-2 font-medium">席位简称</th>
            <th class="px-3 py-2 font-medium">{isSingleton ? '输入值' : '席位类型'}</th>
            <th class="px-3 py-2 font-medium">{isSingleton ? '投票权' : '匹配角色'}</th>
          </tr>
        </thead>
        <tbody>
          {#each importedRows as row, index (index)}
            <tr class="border-t">
              <td class="px-3 py-2">{row.name || '（空）'}</td>
              <td class="px-3 py-2">{row.shortName || '—'}</td>
              <td class="px-3 py-2">
                {isSingleton
                  ? row.hasVotingRights === false
                    ? '否'
                    : ''
                  : row.roleName || '自动匹配'}
              </td>
              <td class="px-3 py-2 text-muted-foreground">{matchedRoleName(row)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if hasUnmatchedImportedRole}
      <Field.FieldError>
        存在无法匹配到当前委员会的席位类型，导入后请在席位列表中重新选择角色。
      </Field.FieldError>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (previewDialogOpen = false)}>取消</Button>
      <Button disabled={!targetCommittee} onclick={confirmImport}>确认导入</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
