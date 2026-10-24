import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '../src/admin/utils'

describe('CSV export', () => {
  it('neutralises formula injection in every cell, including headers', () => {
    const rows = [
      ['Email', '=1+1'],
      ['=cmd|\' /C calc\'!A0', '+1234'],
      ['-2+3+cmd|\' /C calc\'!A0', '@SUM(1+9)*cmd|\' /C calc\'!A0'],
      ['\t=1+1', '\r=1+1'],
      [' normal@example.com', '=HYPERLINK("http://evil.example.com","click")'],
    ]
    const csv = toCsv(rows)
    for (const line of csv.split('\r\n')) {
      for (const cell of line.split('","')) {
        const body = cell.replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"')
        if (!body) continue
        expect(body.startsWith("'") || !/^[\s]*[=+\-@\t\r]/.test(body), body).toBe(true)
      }
    }
    expect(csv).toContain(`"'=cmd|' /C calc'!A0"`)
    expect(csv).toContain(`"'+1234"`)
    expect(csv).toContain(`"'\t=1+1"`)
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example.com"",""click"")"`)
  })

  it('quotes every cell and doubles embedded quotes', () => {
    expect(csvCell('plain')).toBe('"plain"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell(12)).toBe('"12"')
    expect(csvCell(true)).toBe('"true"')
    expect(csvCell(undefined as unknown as string)).toBe('""')
    expect(csvCell(null as unknown as string)).toBe('""')
  })

  it('keeps benign values untouched and guards a bare minus', () => {
    expect(csvCell('2026-10-08')).toBe('"2026-10-08"')
    expect(csvCell('normal@example.com')).toBe('"normal@example.com"')
    expect(csvCell('-')).toBe(`"'-"`)
    expect(csvCell('-12.50')).toBe(`"'-12.50"`)
  })

  it('joins rows with CRLF and never emits a bare newline between rows', () => {
    const csv = toCsv([['a', 'b'], ['c', 'd']])
    expect(csv).toBe('"a","b"\r\n"c","d"')
  })
})
