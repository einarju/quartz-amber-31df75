import { useState } from 'react'
import type { Money, MoneyPeriod, MoneyPeriodKey } from '@shared/schema.ts'
import { Card, Pill, Seg, Stat } from '../components/ui.tsx'
import { money as fmt, plural } from '../lib/format.ts'

type Key = Exclude<MoneyPeriodKey, 'ytd'>

const PERIODS: { value: Key; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'mtd', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
]

const SOURCE_LABEL: Record<string, string> = {
  gumroad: 'Gumroad', stripe: 'Stripe', meta: 'Meta ads', live_db: 'BassVision Live database',
}

/** by_business only carries these three periods; shorter ones show this month instead. */
const BIZ_PERIODS = ['mtd', '30d', 'last_month'] as const
type BizKey = (typeof BIZ_PERIODS)[number]
const isBizKey = (k: Key): k is BizKey => (BIZ_PERIODS as readonly string[]).includes(k)

const usd = (v: number) => fmt(v, true)

/** "2026-11-18 17:15" (Mexico City) -> minutes since then, from the viewer's clock. */
function ageMinutes(asof: string): number {
  const t = Date.parse(`${asof.replace(' ', 'T')}:00-06:00`)
  return Number.isFinite(t) ? Math.round((Date.now() - t) / 60_000) : 0
}

function Stats({ p }: { p: MoneyPeriod }) {
  return (
    <div className="money__stats">
      <Stat label="Gross" value={usd(p.gross)} sub={p.refunds ? `${usd(p.refunds)} refunded` : 'before fees'} />
      <Stat label="Fees" value={usd(p.fees)} sub="Gumroad + Stripe" />
      <Stat label="Net" value={usd(p.net)} sub="gross - fees - refunds" />
      <Stat label="Ad spend" value={usd(p.ads)} sub="Meta" />
      <Stat label="Profit" value={usd(p.profit)} tone={p.profit < 0 ? 'negative' : p.profit > 0 ? 'positive' : undefined}
        sub="net - ad spend" />
      <Stat label="Orders" value={p.orders} sub={p.free ? `+ ${plural(p.free, 'free download')}` : 'paid checkouts'} />
    </div>
  )
}

/** Gross (dim) and net (accent) per day, last 30 days, in one pressed-in well. */
function DailyBars({ days }: { days: Money['daily'] }) {
  const last = days.slice(-30)
  const max = Math.max(1, ...last.map((d) => d.gross))
  const h = (v: number) => (v > 0 ? `${Math.max(3, (v / max) * 100)}%` : '0%')
  const first = last[0]
  const end = last[last.length - 1]
  return (
    <div>
      <div className="mbars" role="img" aria-label="Gross and net per day, last 30 days">
        {last.map((d) => (
          <div key={d.d} className="mbars__day" data-empty={d.gross === 0}
            title={`${d.d}: gross ${usd(d.gross)}, net ${usd(d.net)}, ads ${usd(d.ads)}, ${plural(d.orders, 'order')}`}>
            <i className="mbars__gross" style={{ height: h(d.gross) }} />
            <i className="mbars__net" style={{ height: h(Math.max(0, d.net)) }} />
          </div>
        ))}
      </div>
      <div className="row row--between small faint mbars__axis">
        <span>{first ? first.d.slice(5) : ''}</span>
        <span className="row" style={{ gap: 'var(--s-3)' }}>
          <span><i className="mbars__key mbars__key--gross" /> gross</span>
          <span><i className="mbars__key mbars__key--net" /> net</span>
          <span>best day {usd(Math.max(0, ...last.map((d) => d.gross)))}</span>
        </span>
        <span>{end ? end.d.slice(5) : ''}</span>
      </div>
    </div>
  )
}

export function MoneyCard({ m }: { m: Money }) {
  const [key, setKey] = useState<Key>('mtd')
  const p = m.periods[key]
  const bizKey: BizKey = isBizKey(key) ? key : 'mtd'
  const missing = Object.entries(m.sources).filter(([k, v]) => k !== 'fx' && !v.startsWith('ok'))
  const age = ageMinutes(m.asof)
  const rows = m.by_business.filter((b) => b[bizKey].gross || b[bizKey].ads || b[bizKey].orders || [1, 2, 3].includes(b.id))

  return (
    <Card title="Money" className="money" actions={
      <span className="row money__actions">
        <span className="muted small" title={`Mexico City time. ${m.sources.fx ?? ''}`}>as of {m.asof.slice(11)}</span>
        {age > 90 && <Pill tone="warn" title={`Last update ${m.asof}`}>stale, {Math.round(age / 60)} h old</Pill>}
        <Seg options={PERIODS} value={key} onChange={setKey} />
      </span>
    }>
      <div className="col" style={{ gap: 'var(--s-5)' }}>
        <Stats p={p} />

        <div className="money__split">
          <div className="col" style={{ gap: 'var(--s-2)' }}>
            <div className="stat__label">By business{bizKey !== key ? ' · this month' : ''}</div>
            {rows.map((b) => {
              const q = b[bizKey]
              return (
                <div key={b.id} className="row row--between money__row">
                  <span className="truncate"><b>{b.id || '?'}</b> {b.name}</span>
                  <span className="muted small money__nums">
                    {usd(q.net)} net · {usd(q.ads)} ads · <span className={q.profit < 0 ? 'negative' : ''}>{usd(q.profit)}</span> · {plural(q.orders, 'order')}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="col" style={{ gap: 'var(--s-2)' }}>
            <div className="stat__label">Last 30 days</div>
            <DailyBars days={m.daily} />
          </div>
        </div>

        {(missing.length > 0 || m.fees_estimated) && (
          <div className="row small" style={{ flexWrap: 'wrap', gap: 'var(--s-2)' }}>
            {missing.map(([k, v]) => (
              <Pill key={k} tone="warn" title={v}>{SOURCE_LABEL[k] ?? k}: {v.replace(/^missing:\s*/, '').split(' (')[0]}</Pill>
            ))}
            {m.fees_estimated && <Pill title="Some fees are computed from the published rates, not read from the processor">some fees estimated</Pill>}
          </div>
        )}
      </div>
    </Card>
  )
}
