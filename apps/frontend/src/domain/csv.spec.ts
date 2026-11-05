import { describe, expect, it } from 'vitest'

import { parseCsv, toCsv } from '@/domain/csv'

describe('CSV', () => {
  it('reads quotes, line breaks and doubled quotes inside a cell', () => {
    expect(
      parseCsv('\u{FEFF}Title,Notes\r\n"Logo, v2","Two\nlines ""quoted"""\n')
    ).toEqual([
      ['Title', 'Notes'],
      ['Logo, v2', 'Two\nlines "quoted"']
    ])
  })

  it('finds the semicolon Excel writes in many languages, and drops empty rows', () => {
    expect(parseCsv('Titre;Section\n\nLogo;À faire\n;\n')).toEqual([
      ['Titre', 'Section'],
      ['Logo', 'À faire']
    ])
  })

  it('refuses text that is not CSV', () => {
    expect(parseCsv('Title\n"never closed')).toBeNull()
    expect(parseCsv('PK\u{0}\u{3}')).toBeNull()
  })

  it('keeps a formula from running, and reads it back as it was', () => {
    const rows = [
      ['Title', 'Notes'],
      ['=HYPERLINK("x")', ' padded '],
      ['@me', '-1']
    ]
    const text = toCsv(rows)
    expect(text.startsWith('\u{FEFF}')).toBe(true)
    expect(text).toContain(`"'=HYPERLINK(""x"")"`)
    expect(text).toContain("'@me,'-1")
    expect(parseCsv(text)).toEqual(rows)
  })
})
