import type { Cadence, Payment, PaymentsFile } from '@shared/schema.ts'

/** Local calendar dates as YYYY-MM-DD strings (no time zones in the data). */

export function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const today = (): string => iso(new Date())

export function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function addDays(date: string, n: number): string {
  const d = parse(date)
  d.setDate(d.getDate() + n)
  return iso(d)
}

function step(date: string, cadence: Cadence): string | null {
  const d = parse(date)
  if (cadence === 'once') return null
  if (cadence === 'weekly') d.setDate(d.getDate() + 7)
  if (cadence === 'monthly') d.setMonth(d.getMonth() + 1)
  if (cadence === 'yearly') d.setFullYear(d.getFullYear() + 1)
  return iso(d)
}

export type Occurrence = { date: string; payment: Payment; paid: boolean; next: boolean }

/** Every paid date plus projected due dates of active payments, between from and to (inclusive). */
export function occurrences(file: PaymentsFile, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = []
  for (const p of file.payments) {
    for (const d of p.paid) if (d >= from && d <= to) out.push({ date: d, payment: p, paid: true, next: false })
    if (!p.active || !p.next_due) continue
    let d: string | null = p.next_due
    let first = true
    while (d && d <= to) {
      if (d >= from) out.push({ date: d, payment: p, paid: false, next: first })
      first = false
      d = step(d, p.cadence)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function toUsd(p: Payment, file: PaymentsFile): number | null {
  if (p.amount === null) return null
  return p.currency === 'MXN' ? p.amount / file.usd_mxn : p.currency === 'EUR' ? p.amount * file.eur_usd : p.amount
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December']

export function shortDate(date: string): string {
  const d = parse(date)
  return `${MONTHS[d.getMonth()]!.slice(0, 3)} ${d.getDate()}`
}
