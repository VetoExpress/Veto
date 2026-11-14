import * as XLSX from 'xlsx'

export type SeatImportMode = 'conference' | 'singleton'

export interface ImportedSeat {
  name: string
  shortName: string
  roleName?: string
  hasVotingRights?: boolean
  hasVetoPower?: boolean
}

export type SeatImportErrorCode =
  'invalid_workbook' | 'empty_workbook' | 'sheet_not_found' | 'no_valid_rows'

export class SeatImportError extends Error {
  readonly code: SeatImportErrorCode

  constructor(code: SeatImportErrorCode) {
    super(code)
    this.name = 'SeatImportError'
    this.code = code
  }
}

export interface SeatWorkbook {
  readonly sheetNames: readonly string[]
  importSheet(sheetName: string, mode: SeatImportMode): ImportedSeat[]
}

const TEXT_SEPARATOR = /[,，;；|]/
const NO_VOTING_RIGHTS = /^(否|无|没有|false|0)$/i
const NO_VETO_POWER = /^(否|无|没有|false|0)$/i

function toImportedSeat(row: readonly unknown[], mode: SeatImportMode): ImportedSeat {
  const name = String(row[0] ?? '').trim()
  const shortName = String(row[1] ?? '').trim()
  const thirdColumn = String(row[2] ?? '').trim()
  const fourthColumn = String(row[3] ?? '').trim()
  const hasVetoPower = Boolean(fourthColumn) && !NO_VETO_POWER.test(fourthColumn)

  if (mode === 'singleton') {
    return {
      name,
      shortName,
      hasVotingRights: !NO_VOTING_RIGHTS.test(thirdColumn),
      hasVetoPower
    }
  }

  return { name, shortName, roleName: thirdColumn, hasVetoPower }
}

function hasContent(seat: ImportedSeat): boolean {
  return Boolean(seat.name || seat.shortName || seat.roleName)
}

function parseRows(rows: readonly (readonly unknown[])[], mode: SeatImportMode): ImportedSeat[] {
  const seats = rows.map((row) => toImportedSeat(row, mode)).filter(hasContent)
  if (seats.length === 0) throw new SeatImportError('no_valid_rows')
  return seats
}

export function parseSeatText(text: string, mode: SeatImportMode): ImportedSeat[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(TEXT_SEPARATOR))

  return parseRows(rows, mode)
}

export function readSeatWorkbook(data: ArrayBuffer | Uint8Array): SeatWorkbook {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(data, { type: 'array' })
  } catch {
    throw new SeatImportError('invalid_workbook')
  }

  if (workbook.SheetNames.length === 0) throw new SeatImportError('empty_workbook')
  const sheetNames = Object.freeze([...workbook.SheetNames])

  return Object.freeze({
    sheetNames,
    importSheet(sheetName: string, mode: SeatImportMode): ImportedSeat[] {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) throw new SeatImportError('sheet_not_found')
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: ''
      }) as unknown[][]
      return parseRows(rows.slice(1), mode)
    }
  })
}
