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
  accounts: Account[]
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

/** accounts.md: every email, domain, handle, store and Meta asset, one row per business and kind. */
export type AccountStatus = 'planned' | 'created' | 'live'

/** Layer 1 identity, 2 channels, 3 money, 4 details (the build order on the plan page). */
export const ACCOUNT_KINDS = [
  { id: 'domain', label: 'Domain', layer: 1, hint: 'brand.com' },
  { id: 'email', label: 'Email', layer: 1, hint: 'hello@brand.com' },
  { id: 'instagram', label: 'Instagram', layer: 2, hint: '@handle' },
  { id: 'facebook', label: 'Facebook', layer: 2, hint: 'Page name' },
  { id: 'youtube', label: 'YouTube', layer: 2, hint: '@channel' },
  { id: 'x', label: 'X', layer: 2, hint: '@handle' },
  { id: 'tiktok', label: 'TikTok', layer: 2, hint: '@handle' },
  { id: 'soundcloud', label: 'SoundCloud', layer: 2, hint: 'soundcloud.com/name' },
  { id: 'beatstars', label: 'BeatStars', layer: 2, hint: 'store name' },
  { id: 'whatsapp', label: 'WhatsApp', layer: 2, hint: 'business name (which SIM below)' },
  { id: 'store', label: 'Store', layer: 3, hint: 'Gumroad, Stripe, ticketing' },
  { id: 'meta', label: 'Meta portfolio', layer: 4, hint: 'portfolio name' },
  { id: 'ad_account', label: 'Ad account', layer: 4, hint: 'account id or name' },
  { id: 'card', label: 'Card', layer: 4, hint: 'card nickname, never the number' },
  { id: 'vault', label: 'Vault', layer: 4, hint: 'vault entry name' },
  { id: 'wallet', label: 'Wallet', layer: 4, hint: 'wallet nickname' },
] as const

export type AccountKind = (typeof ACCOUNT_KINDS)[number]['id']

export type Account = {
  business: string // "1".."11"
  kind: AccountKind
  value: string
  status: AccountStatus
  phone: '' | 'main' | 'second' // which SIM verified it, never the number
  note: string
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
  accounts: Account[]
  totals: Totals
  goalMonthlyUsd: number
}
