import YAML from 'yaml'
import type {
  AppState, BarStat, Business, Cadence, CheckItem, Engine, Foundation, MoneyField, Payment,
  PaymentsFile, Stage, Todo,
} from './schema.ts'
import { MONEY_FIELDS } from './schema.ts'

/**
 * The registry's rules as pure functions over file text, so they run in the browser.
 * Edits are line-based on purpose: ticking a box changes one character on one line and
 * never re-serialises a file the human also edits (payments.md is the one exception).
 */

const BOX = /^(\s*- \[)( |x|X)(\] )(.+)$/

function split(text: string): { lines: string[]; eol: string } {
  return { lines: text.split(/\r?\n/), eol: text.includes('\r\n') ? '\r\n' : '\n' }
}

function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  return end === -1 ? 0 : end + 1
}

function frontmatter(text: string): Record<string, unknown> {
  const { lines } = split(text)
  const end = bodyStart(lines)
  if (!end) return {}
  return (YAML.parse(lines.slice(1, end - 1).join('\n')) ?? {}) as Record<string, unknown>
}

function sections(lines: string[]): Map<string, { line: number; text: string }[]> {
  const out = new Map<string, { line: number; text: string }[]>()
  let current: string | null = null
  for (let i = bodyStart(lines); i < lines.length; i++) {
    const l = lines[i] ?? ''
    if (l.startsWith('## ')) {
      current = l.slice(3).trim().toLowerCase()
      out.set(current, [])
    } else if (current) {
      out.get(current)!.push({ line: i, text: l })
    }
  }
  return out
}

function checks(rows: { line: number; text: string }[] | undefined): CheckItem[] {
  return (rows ?? []).flatMap(({ line, text }) => {
    const m = BOX.exec(text)
    return m ? [{ line, text: m[4]!.trim(), done: m[2] !== ' ' }] : []
  })
}

const prose = (rows: { line: number; text: string }[] | undefined) => (rows ?? []).map((r) => r.text).join('\n').trim()
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const num = (v: unknown): number | null =>
  typeof v === 'number' ? v : v === null || v === undefined || v === '' ? null : Number(v)

/** Same scoring as scripts/progress.py: share of ticked boxes, rounded. */
export function bar(items: CheckItem[]): BarStat {
  const done = items.filter((i) => i.done).length
  return { pct: items.length ? Math.round((100 * done) / items.length) : 0, done, total: items.length }
}

function stage(build: BarStat, auto: BarStat): Stage {
  if (build.pct < 100) return 'build'
  return auto.pct === 100 ? 'self-running' : 'automation'
}

export function parseBusiness(file: string, text: string): Business {
  const { lines } = split(text)
  const data = frontmatter(text)
  const s = sections(lines)
  const build = checks(s.get('build'))
  const automation = checks(s.get('automation'))
  const buildBar = bar(build)
  const automationBar = bar(automation)
  return {
    file,
    id: Number(data.id),
    name: str(data.name),
    engine: (str(data.engine) || 'launch') as Engine,
    brand: str(data.brand),
    moneyFrom: str(data.money_from),
    url: str(data.url),
    repo: str(data.repo),
    money: Object.fromEntries(MONEY_FIELDS.map((k) => [k, num(data[k])])) as Record<MoneyField, number | null>,
    accounts: Object.entries(data).filter(([k]) => k.startsWith('acct_'))
      .map(([k, v]) => ({ key: k.slice(5), value: str(v) || 'none' })),
    summary: prose(s.get('money from')),
    build,
    automation,
    buildBar,
    automationBar,
    stage: stage(buildBar, automationBar),
    nextSteps: (s.get('next steps') ?? []).filter((r) => r.text.startsWith('- ')).map((r) => r.text.slice(2).trim()),
    notes: prose(s.get('notes')),
  }
}

/** Flip one checkbox. Throws if the line is not a checkbox (the file changed underneath). */
export function toggleLine(text: string, line: number, name: string): string {
  const doc = split(text)
  const cur = doc.lines[line]
  const m = cur === undefined ? null : BOX.exec(cur)
  if (!m) throw new Error(`Refusing to write: line ${line + 1} of ${name} is not a checkbox. Reload and try again.`)
  doc.lines[line] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}${m[4]}`
  return doc.lines.join(doc.eol)
}

/** Set one frontmatter number, keeping any `# comment` on the line. */
export function setField(text: string, key: MoneyField, value: number | null): string {
  if (!MONEY_FIELDS.includes(key)) throw new Error(`Invalid field ${key}`)
  const doc = split(text)
  const end = bodyStart(doc.lines)
  const re = new RegExp(`^${key}:\\s*([^#]*?)(\\s+#.*)?$`)
  const i = doc.lines.findIndex((l, idx) => idx < end && re.test(l))
  const rendered = value === null || Number.isNaN(value) ? '' : String(value)
  if (i === -1) doc.lines.splice(end - 1, 0, `${key}: ${rendered}`)
  else doc.lines[i] = `${key}:${rendered ? ` ${rendered}` : ''}${re.exec(doc.lines[i]!)?.[2] ?? ''}`
  return doc.lines.join(doc.eol)
}

/* ------------------------------------------------------------- foundation */

export function parseFoundation(text: string): Foundation {
  const s = sections(split(text).lines)
  const tableKey = [...s.keys()].find((k) => k.startsWith('start now'))
  const approvals = (tableKey ? s.get(tableKey)! : [])
    .map((r) => r.text.trim())
    .filter((t) => t.startsWith('|') && !/^\|[\s|:-]+\|$/.test(t))
    .map((t) => t.slice(1, -1).split('|').map((c) => c.trim()))
  const kitKey = [...s.keys()].find((k) => k.startsWith('identity kit'))
  return { steps: checks(s.get('do in order')), kit: checks(kitKey ? s.get(kitKey) : undefined), approvals }
}

/* ------------------------------------------------------------------ todos */

const DUE = /\s@(\d{4}-\d{2}-\d{2})\b/
const BIZ = /\s#(\d{1,2})\b/

export function parseTodos(text: string): Todo[] {
  return split(text).lines.flatMap((t, line) => {
    const m = BOX.exec(t)
    if (!m) return []
    const body = ` ${m[4]!}`
    const biz = BIZ.exec(body)?.[1]
    return [{
      line, done: m[2] !== ' ', due: DUE.exec(body)?.[1] ?? null, business: biz ? Number(biz) : null,
      text: body.replace(DUE, '').replace(BIZ, '').trim(),
    }]
  })
}

export function addTodo(text: string, item: string, due: string | null, business: number | null): string {
  const clean = item.replace(/[\r\n]+/g, ' ').trim()
  if (!clean) throw new Error('Write the to-do first.')
  const doc = split(text)
  while (doc.lines.length && doc.lines[doc.lines.length - 1] === '') doc.lines.pop()
  doc.lines.push(`- [ ] ${clean}${due ? ` @${due}` : ''}${business ? ` #${business}` : ''}`, '')
  return doc.lines.join(doc.eol)
}

export function deleteTodo(text: string, line: number): string {
  const doc = split(text)
  if (!BOX.test(doc.lines[line] ?? '')) throw new Error(`Refusing to write: line ${line + 1} is not a to-do. Reload and try again.`)
  doc.lines.splice(line, 1)
  return doc.lines.join(doc.eol)
}

/* --------------------------------------------------------------- payments */

export function parsePayments(text: string): PaymentsFile {
  const data = frontmatter(text)
  const list = (data.payments ?? []) as Partial<Payment>[]
  return {
    usd_mxn: Number(data.usd_mxn ?? 18.5),
    eur_usd: Number(data.eur_usd ?? 1.08),
    payments: list.map((p) => ({
      id: str(p.id),
      name: str(p.name),
      amount: num(p.amount),
      currency: (p.currency ?? 'USD') as Payment['currency'],
      cadence: (p.cadence ?? 'monthly') as Cadence,
      next_due: p.next_due ? str(p.next_due).slice(0, 10) : null,
      business: str(p.business) || 'shared',
      card: str(p.card),
      note: str(p.note),
      paid: (p.paid ?? []).map((d) => str(d).slice(0, 10)),
      active: p.active !== false,
    })),
  }
}

/** Rewrite payments.md: new frontmatter, the prose below it untouched. */
export function writePayments(text: string, file: PaymentsFile): string {
  const { lines, eol } = split(text)
  const body = lines.slice(bodyStart(lines)).join(eol)
  return `---${eol}${YAML.stringify(file).trimEnd().split('\n').join(eol)}${eol}---${eol}${body}`
}

export function upsertPayment(file: PaymentsFile, input: Partial<Payment>): PaymentsFile {
  const name = str(input.name).trim()
  if (!name) throw new Error('A payment needs a name.')
  const id = input.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const old = file.payments.find((p) => p.id === id)
  const merged: Payment = {
    id, name,
    amount: input.amount === undefined ? old?.amount ?? null : num(input.amount),
    currency: input.currency ?? old?.currency ?? 'USD',
    cadence: input.cadence ?? old?.cadence ?? 'monthly',
    next_due: input.next_due === undefined ? old?.next_due ?? null : input.next_due || null,
    business: input.business ?? old?.business ?? 'shared',
    card: input.card ?? old?.card ?? '',
    note: input.note ?? old?.note ?? '',
    paid: old?.paid ?? [],
    active: input.active ?? old?.active ?? true,
  }
  return { ...file, payments: old ? file.payments.map((p) => (p.id === id ? merged : p)) : [...file.payments, merged] }
}

export const deletePayment = (file: PaymentsFile, id: string): PaymentsFile =>
  ({ ...file, payments: file.payments.filter((p) => p.id !== id) })

function advance(date: string, cadence: Cadence): string | null {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  if (cadence === 'once') return null
  if (cadence === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7)
  if (cadence === 'monthly') dt.setUTCMonth(dt.getUTCMonth() + 1)
  if (cadence === 'yearly') dt.setUTCFullYear(dt.getUTCFullYear() + 1)
  return dt.toISOString().slice(0, 10)
}

/** Record the current due date as paid and move to the next one. */
export function markPaid(file: PaymentsFile, id: string, today: string): PaymentsFile {
  return {
    ...file,
    payments: file.payments.map((p) => p.id !== id ? p : {
      ...p,
      paid: [...p.paid, p.next_due ?? today],
      next_due: p.next_due ? advance(p.next_due, p.cadence) : null,
      active: p.cadence === 'once' ? false : p.active,
    }),
  }
}

export function monthlyUsd(p: Payment, file: PaymentsFile): number | null {
  if (p.amount === null || !p.active || p.cadence === 'once') return null
  const usd = p.currency === 'MXN' ? p.amount / file.usd_mxn : p.currency === 'EUR' ? p.amount * file.eur_usd : p.amount
  return p.cadence === 'yearly' ? usd / 12 : p.cadence === 'weekly' ? (usd * 52) / 12 : usd
}

/* ------------------------------------------------------------------ state */

export type Files = {
  businesses: { file: string; text: string }[]
  foundation: string
  todos: string
  payments: string
}

export function buildState(files: Files): AppState {
  const businesses = files.businesses.map((b) => parseBusiness(b.file, b.text)).sort((a, b) => a.id - b.id)
  const payments = parsePayments(files.payments)
  const sum = (k: MoneyField) => businesses.reduce((a, b) => a + (b.money[k] ?? 0), 0)
  const active = payments.payments.filter((p) => p.active)
  return {
    generated: new Date().toISOString(),
    businesses,
    foundation: parseFoundation(files.foundation),
    todos: parseTodos(files.todos),
    payments,
    goalMonthlyUsd: 100_000,
    totals: {
      revenueMtdUsd: sum('revenue_mtd_usd'),
      adSpendMtdUsd: sum('ad_spend_mtd_usd'),
      minutesPerWeek: sum('minutes_per_week'),
      built: businesses.filter((b) => b.buildBar.pct === 100).length,
      automated: businesses.filter((b) => b.automationBar.pct === 100).length,
      monthlyCostsUsd: active.reduce((a, p) => a + (monthlyUsd(p, payments) ?? 0), 0),
      unpricedPayments: active.filter((p) => p.amount === null).length,
    },
  }
}
