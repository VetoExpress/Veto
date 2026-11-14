import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { parseSeatText, readSeatWorkbook } from './seat-import'

describe('seat import', () => {
  it('parses conference text with supported separators', () => {
    expect(parseSeatText('中国，中国,常规代表,是\n美国；US；观察员；否\n法国|FR|', 'conference')).toEqual([
      { name: '中国', shortName: '中国', roleName: '常规代表', hasVetoPower: true },
      { name: '美国', shortName: 'US', roleName: '观察员', hasVetoPower: false },
      { name: '法国', shortName: 'FR', roleName: '', hasVetoPower: false }
    ])
  })

  it('normalizes singleton voting rights', () => {
    expect(parseSeatText('中国,CHN,否,是\n美国,USA,true,否\n法国,FR,0', 'singleton')).toEqual([
      { name: '中国', shortName: 'CHN', hasVotingRights: false, hasVetoPower: true },
      { name: '美国', shortName: 'USA', hasVotingRights: true, hasVetoPower: false },
      { name: '法国', shortName: 'FR', hasVotingRights: false, hasVetoPower: false }
    ])
  })

  it('lists sheets and skips the spreadsheet header', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['席位名称', '席位简称', '席位类型', '否决权'],
        ['中国', 'CHN', '常规代表', '是']
      ]),
      '席位'
    )
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const reader = readSeatWorkbook(data)

    expect(reader.sheetNames).toEqual(['席位'])
    expect(reader.importSheet('席位', 'conference')).toEqual([
      { name: '中国', shortName: 'CHN', roleName: '常规代表', hasVetoPower: true }
    ])
  })

  it('reports an empty text import with a stable error code', () => {
    expect(() => parseSeatText(' \n ', 'conference')).toThrowError(
      expect.objectContaining({ code: 'no_valid_rows' })
    )
  })
})
