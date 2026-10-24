import type { OrderStatus } from '../types'

export { useUnsavedChanges } from './UnsavedChanges'

export function formatAdminDate(value: unknown, fallback = 'Date unavailable') {
  if (!value) return fallback
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  else if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') date = value.toDate()
  else if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') date = new Date(value.seconds * 1000)
  if (!date || Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function dateValue(value: unknown) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0
  if (typeof value === 'object' && value && 'toMillis' in value && typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

export const orderTone = (status: OrderStatus): 'positive' | 'danger' | 'warning' =>
  status === 'paid' || status === 'fulfilled' ? 'positive' : ['cancelled', 'payment_failed', 'checkout_failed'].includes(status) ? 'danger' : 'warning'

export function truncate(value: string, length = 90) {
  return value.length > length ? `${value.slice(0, length).trim()}…` : value
}

// Leading characters that spreadsheet applications interpret as the start of a
// formula. Any cell beginning with one (even after leading whitespace) is
// prefixed with an apostrophe so exported data can never execute on open.
const CSV_FORMULA_START = /^[\s]*[=+\-@\t\r]/

/**
 * Escapes one CSV cell: formula-injection protection first, then RFC-style
 * quoting with doubled quotes. Applied to every cell, including headers.
 */
export function csvCell(value: string | number | boolean) {
  const text = String(value ?? '')
  const guarded = CSV_FORMULA_START.test(text) ? `'${text}` : text
  return `"${guarded.replace(/"/g, '""')}"`
}

/** Serialises every cell of every row with formula protection and quoting. */
export function toCsv(rows: Array<Array<string | number | boolean>>) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | boolean>>) {
  const csv = toCsv(rows)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
