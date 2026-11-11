import * as XLSX from 'xlsx'

export interface SeatInviteExportRow {
  committeeName?: string
  name: string
  shortName?: string
  roleName?: string
  inviteCode: string
}

type ExportLocale = 'zh-CN' | 'en-US'
const EXPORT_LABELS = {
  'zh-CN': { headers: ['席位名称', '席位简称', '角色', '邀请码'], committee: '委员会', sheet: '邀请码' },
  'en-US': { headers: ['Seat name', 'Short name', 'Role', 'Invite code'], committee: 'Committee', sheet: 'Invite codes' }
} as const
const BASE_COL_WIDTHS = [{ wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 20 }]

function hasCommitteeColumn(rows: readonly SeatInviteExportRow[]): boolean {
  return rows.some((row) => row.committeeName)
}

function cells(rows: readonly SeatInviteExportRow[], locale: ExportLocale): string[][] {
  const withCommittee = hasCommitteeColumn(rows)
  const labels = EXPORT_LABELS[locale]
  return [
    withCommittee ? [labels.committee, ...labels.headers] : [...labels.headers],
    ...rows.map((row) => {
      const base = [
        row.name,
        row.shortName ?? '',
        row.roleName ?? '',
        row.inviteCode
      ]
      return withCommittee ? [row.committeeName ?? '', ...base] : base
    })
  ]
}

function textCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim()
}

export function createSeatInviteText(rows: readonly SeatInviteExportRow[], locale: ExportLocale = 'zh-CN'): string {
  return cells(rows, locale).map((row) => row.map(textCell).join('\t')).join('\r\n') + '\r\n'
}

export function createSeatInviteWorkbook(rows: readonly SeatInviteExportRow[], locale: ExportLocale = 'zh-CN'): Uint8Array<ArrayBuffer> {
  const worksheet = XLSX.utils.aoa_to_sheet(cells(rows, locale))
  worksheet['!cols'] = hasCommitteeColumn(rows)
    ? [{ wch: 24 }, ...BASE_COL_WIDTHS]
    : BASE_COL_WIDTHS
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, EXPORT_LABELS[locale].sheet)
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Uint8Array(data)
}
