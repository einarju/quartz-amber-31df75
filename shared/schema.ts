/** Types shared by the server and the app. The registry markdown is the source of truth. */

export type ProjectAccent = 'orange' | 'violet' | 'cyan' | 'lime' | 'pink'

export type Engine = 'visual' | 'ableton' | 'audience' | 'launch' | 'sandbox'

export const ENGINE_ACCENT: Record<Engine, ProjectAccent> = {
  visual: 'orange',
  ableton: 'cyan',
  audience: 'pink',
  launch: 'lime',
  sandbox: 'violet',
}

export const ENGINE_LABEL: Record<Engine, string> = {
  visual: 'Visual engine',
  ableton: 'Ableton engine',
  audience: 'Audience to fee',
  launch: 'Product launch',
  sandbox: 'Sandbox',
}

/** One checkbox line. `line` is its 0-based line number in the file, used to toggle it. */
export type CheckItem = { line: number; text: string; done: boolean }

export type BarStat = { pct: number; done: number; total: number }

export type Stage = 'build' | 'automation' | 'self-running'

/** The numbers kept in a manifest's frontmatter that the dashboard lets you edit. */
export const MONEY_FIELDS = ['revenue_mtd_usd', 'ad_spend_mtd_usd', 'costs_monthly_usd', 'minutes_per_week'] as const
export type MoneyField = (typeof MONEY_FIELDS)[number]

export type Business = {
  file: string
  id: number
  name: string
  engine: Engine
  brand: string
  moneyFrom: string
  url: string
  repo: string
  money: Record<MoneyField, number | null>
  accounts: { key: string; value: string }[]
  summary: string
  build: CheckItem[]
  automation: CheckItem[]
  buildBar: BarStat
  automationBar: BarStat
  stage: Stage
  nextSteps: string[]
  notes: string
}

export type Foundation = {
  steps: CheckItem[]
  kit: CheckItem[]
  approvals: string[][] // header row first
}

export type Todo = { line: number; text: string; done: boolean; due: string | null; business: number | null }

export type Cadence = 'monthly' | 'yearly' | 'weekly' | 'once'

export type Payment = {
  id: string
  name: string
  amount: number | null
  currency: 'USD' | 'MXN' | 'EUR'
  cadence: Cadence
  next_due: string | null
  business: string // "1".."11", "shared", "personal"
  card: string
  note: string
  paid: string[]
  active: boolean
}

export type PaymentsFile = { usd_mxn: number; eur_usd: number; payments: Payment[] }

export type Totals = {
  revenueMtdUsd: number
  adSpendMtdUsd: number
  minutesPerWeek: number
  built: number
  automated: number
  monthlyCostsUsd: number
  unpricedPayments: number
}

export type AppState = {
  generated: string
  businesses: Business[]
  foundation: Foundation
  todos: Todo[]
  payments: PaymentsFile
  totals: Totals
  goalMonthlyUsd: number
}
