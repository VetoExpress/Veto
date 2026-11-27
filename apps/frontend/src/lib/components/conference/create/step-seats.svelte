<script lang="ts">
  import {
    procedureMessage,
    renderProcedureMessage,
    type ProcedureMessage
  } from '$lib/components/conference/common/message'
  import { t } from '$lib/i18n'
  import { FileSpreadsheet, FileText, Plus, Trash2, Upload } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Field from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Select from '$lib/components/ui/select'
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

  const committee = $derived(wizard.committees[0])
  const showNoSeats = $derived(
    wizard.attempted && (committee?.seats.length ?? 0) === 0
  )

  let formatDialogOpen = $state(false)
  let textDialogOpen = $state(false)
  let sheetDialogOpen = $state(false)
  let previewDialogOpen = $state(false)
  let importMode = $state<ImportMode>('excel')
  let textValue = $state('')
  let importError = $state<ProcedureMessage>('')
  let selectedSheet = $state('')
  let importedRows = $state<ImportedSeat[]>([])
  let workbook = $state<SeatWorkbook | null>(null)
  let fileInput = $state<HTMLInputElement | undefined>(undefined)

  function openFormatDialog(mode: ImportMode): void {
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
      importError = importErrorMessage(
        error,
        procedureMessage('procedure_failed_to_read_excel_file')
      )
      formatDialogOpen = true
    }
  }

  function readSelectedSheet(): void {
    if (!workbook || !selectedSheet) return
    try {
      importedRows = workbook.importSheet(selectedSheet, 'singleton')
      sheetDialogOpen = false
      previewDialogOpen = true
    } catch (error) {
      importError = importErrorMessage(
        error,
        procedureMessage('procedure_no_valid_data_found_check_the_worksheet')
      )
    }
  }

  function importErrorMessage(
    error: unknown,
    fallback: ProcedureMessage
  ): ProcedureMessage {
    if (!(error instanceof SeatImportError))
      return error instanceof Error ? error.message : fallback
    if (error.code === 'empty_workbook')
      return procedureMessage('procedure_no_readable_worksheets_in_this_file')
    if (error.code === 'sheet_not_found')
      return procedureMessage('procedure_selected_worksheet_not_found')
    if (error.code === 'no_valid_rows') return fallback
    return fallback
  }

  function readText(): void {
    try {
      importedRows = parseSeatText(textValue, 'singleton')
      textDialogOpen = false
      previewDialogOpen = true
    } catch (error) {
      importError = importErrorMessage(
        error,
        procedureMessage(
          'procedure_no_valid_data_found_enter_one_seat_per_line_using_the_required_format'
        )
      )
    }
  }

  function confirmImport(): void {
    if (!committee || importedRows.length === 0) return
    wizard.addImportedSeats(
      committee.id,
      importedRows.map((row) => ({
        name: row.name,
        shortName: row.shortName,
        hasVotingRights: row.hasVotingRights ?? true,
        hasVetoPower: row.hasVetoPower ?? false
      }))
    )
    previewDialogOpen = false
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

{#if committee}
  <section class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <Button variant="outline" size="sm" onclick={() => openFormatDialog('excel')}>
        <FileSpreadsheet data-icon="inline-start" />
        {t('procedure_import_from_excel')}
      </Button>
      <Button variant="outline" size="sm" onclick={() => openFormatDialog('text')}>
        <FileText data-icon="inline-start" />
        {t('procedure_import_from_text')}
      </Button>
      <Button variant="outline" size="sm" onclick={() => wizard.addSeat(committee.id)}>
        <Plus data-icon="inline-start" />
        {t('procedure_add_seat_2')}
      </Button>
    </div>

    <div class="flex flex-col gap-2">
      {#each committee.seats as seat (seat.id)}
        {@const showSeatNameError = wizard.attempted && seat.name.trim().length === 0}
        <div class="flex flex-col gap-1">
          <div
            class="grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_9rem_9rem_2.5rem]"
          >
            <Input
              bind:value={seat.name}
              placeholder={t('procedure_seat_name')}
              aria-label={t('procedure_seat_name')}
              aria-invalid={showSeatNameError || undefined}
            />
            <Input
              bind:value={seat.shortName}
              placeholder={t('procedure_seat_abbreviation_optional')}
              aria-label={t('procedure_seat_abbreviation')}
            />
            <label
              class="flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs text-muted-foreground"
            >
              <Checkbox
                checked={seat.hasVotingRights ?? true}
                aria-label={t('procedure_voting_rights')}
                onCheckedChange={(checked) =>
                  wizard.setSeatVotingRights(committee.id, seat.id, checked)}
              />
              {t('procedure_voting_rights')}
            </label>
            <label
              class="flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs text-muted-foreground"
            >
              <Checkbox
                checked={seat.hasVetoPower ?? false}
                disabled={!seat.hasVotingRights}
                aria-label={t('procedure_veto_rights')}
                onCheckedChange={(checked) =>
                  wizard.setSeatVetoPower(committee.id, seat.id, checked)}
              />
              {t('procedure_veto_rights')}
            </label>
            <Button
              variant="ghost"
              size="icon"
              title={t('procedure_delete_seat')}
              onclick={() => wizard.removeSeat(committee.id, seat.id)}
            >
              <Trash2 class="text-destructive" />
            </Button>
          </div>
          {#if showSeatNameError}
            <Field.FieldError>{t('procedure_enter_a_seat_name')}</Field.FieldError>
          {/if}
        </div>
      {:else}
        <p
          class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
        >
          {t('procedure_no_seats_assigned')}
        </p>
      {/each}
    </div>

    {#if showNoSeats}
      <Field.FieldError>
        {t('procedure_assign_at_least_one_seat_to_each_committee')}
      </Field.FieldError>
    {/if}
  </section>
{/if}

<Dialog.Root bind:open={formatDialogOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>
        {importMode === 'excel'
          ? t('procedure_import_seats_from_excel')
          : t('procedure_import_seats_from_text')}
      </Dialog.Title>
      <Dialog.Description>
        {t('procedure_check_that_your_data_matches_the_following_format_before_importing')}
      </Dialog.Description>
    </Dialog.Header>
    {#if importMode === 'excel'}
      <div class="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>{t('procedure_the_first_row_is_a_header_data_starts_on_the_second_row')}</p>
        <div class="overflow-hidden rounded-md border">
          <table class="w-full text-sm">
            <thead class="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium">{t('procedure_column_a')}</th>
                <th class="px-3 py-2 font-medium">{t('procedure_column_b_optional')}</th>
                <th class="px-3 py-2 font-medium">{t('procedure_column_c_optional')}</th>
                <th class="px-3 py-2 font-medium">{t('procedure_column_d_optional')}</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-t">
                <td class="px-3 py-2">{t('procedure_seat_name')}</td>
                <td class="px-3 py-2">{t('procedure_seat_abbreviation_optional')}</td>
                <td class="px-3 py-2">
                  {t('procedure_voting_rights_optional_yes_by_default')}
                </td>
                <td class="px-3 py-2">{t('procedure_veto_rights_optional')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>{t('procedure_after_choosing_a_file_select_the_worksheet_to_read')}</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>{t('procedure_one_seat_per_line_in_this_format')}</p>
        <code class="rounded-md bg-muted px-3 py-2 text-foreground">
          {t('procedure_seat_name_abbreviation_voting_rights')}
        </code>
        <p>
          {t(
            'procedure_abbreviation_and_voting_rights_are_optional_use_for_no_voting_rights_other_values_and_'
          )}
        </p>
        <p>{t('procedure_separators_comma_chinese_comma_semicolon_chinese_semicolon_or')}</p>
      </div>
    {/if}
    {#if importError}
      <Field.FieldError>{renderProcedureMessage(importError)}</Field.FieldError>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (formatDialogOpen = false)}>
        {t('procedure_cancel')}
      </Button>
      <Button onclick={confirmFormatDialog}>
        <Upload data-icon="inline-start" />
        {importMode === 'excel'
          ? t('procedure_choose_file')
          : t('procedure_continue_entering_text')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={textDialogOpen}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{t('procedure_paste_seat_data')}</Dialog.Title>
      <Dialog.Description>
        {t('procedure_one_seat_per_line_separate_fields_with_commas_semicolons_or')}
      </Dialog.Description>
    </Dialog.Header>
    <Textarea
      bind:value={textValue}
      rows={10}
      placeholder={t('procedure_seat_name_abbreviation_voting_rights')}
    />
    {#if importError}
      <Field.FieldError>{renderProcedureMessage(importError)}</Field.FieldError>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (textDialogOpen = false)}>
        {t('procedure_cancel')}
      </Button>
      <Button onclick={readText}>{t('procedure_read_and_preview')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={sheetDialogOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('procedure_choose_worksheet')}</Dialog.Title>
      <Dialog.Description>
        {t(
          'procedure_choose_a_worksheet_to_read_its_first_row_is_treated_as_a_header_and_skipped'
        )}
      </Dialog.Description>
    </Dialog.Header>
    <Select.Root type="single" bind:value={selectedSheet}>
      <Select.Trigger class="w-full" aria-label={t('procedure_worksheet')}>
        {selectedSheet || t('procedure_choose_worksheet_2')}
      </Select.Trigger>
      <Select.Content>
        {#each workbook?.sheetNames ?? [] as sheet (sheet)}
          <Select.Item value={sheet} label={sheet} />
        {/each}
      </Select.Content>
    </Select.Root>
    {#if importError}
      <Field.FieldError>{renderProcedureMessage(importError)}</Field.FieldError>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (sheetDialogOpen = false)}>
        {t('procedure_cancel')}
      </Button>
      <Button disabled={!selectedSheet} onclick={readSelectedSheet}>
        {t('procedure_read_and_preview')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={previewDialogOpen}>
  <Dialog.Content class="max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>{t('procedure_import_preview')}</Dialog.Title>
      <Dialog.Description>
        {t('procedure_seat_import_confirmation', { value1: importedRows.length })}
      </Dialog.Description>
    </Dialog.Header>
    <p class="text-sm text-muted-foreground">
      {t('procedure_seat_import_target', {
        value1: committee?.name || t('procedure_untitled_committee')
      })}
    </p>
    <div class="max-h-[50vh] overflow-auto rounded-md border">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-muted/90 text-left text-xs text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">{t('procedure_seat_name')}</th>
            <th class="px-3 py-2 font-medium">{t('procedure_seat_abbreviation')}</th>
            <th class="px-3 py-2 font-medium">{t('procedure_voting_rights')}</th>
            <th class="px-3 py-2 font-medium">{t('procedure_veto_rights')}</th>
          </tr>
        </thead>
        <tbody>
          {#each importedRows as row, index (index)}
            <tr class="border-t">
              <td class="px-3 py-2">{row.name || t('procedure_empty')}</td>
              <td class="px-3 py-2">{row.shortName || '—'}</td>
              <td class="px-3 py-2">
                {row.hasVotingRights === false ? t('procedure_no') : t('procedure_yes')}
              </td>
              <td class="px-3 py-2 text-muted-foreground">
                {row.hasVetoPower ? t('procedure_yes') : t('procedure_no')}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (previewDialogOpen = false)}>
        {t('procedure_cancel')}
      </Button>
      <Button disabled={!committee} onclick={confirmImport}>
        {t('procedure_confirm_import')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
