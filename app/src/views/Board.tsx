import type { Business, Engine } from '@shared/schema.ts'
import { ENGINE_ACCENT, ENGINE_LABEL } from '@shared/schema.ts'
import { Bar, Card, Eyebrow, Pill, Ring, Stat, accentColor, accentGrad } from '../components/ui.tsx'
import { compact, inCurrency, money } from '../lib/format.ts'
import { occurrences, shortDate, today, addDays, toUsd } from '../lib/dates.ts'
import { useAppState } from '../lib/store.tsx'

const ENGINES: Engine[] = ['visual', 'ableton', 'audience', 'launch', 'sandbox']

export const STAGE_LABEL = { build: 'Building', automation: 'Automating', 'self-running': 'Self-running' } as const

export function BizCard({ b, onGo }: { b: Business; onGo: (r: string) => void }) {
  const accent = ENGINE_ACCENT[b.engine]
  return (
    <button type="button" className="biz" onClick={() => onGo(`biz/${b.file}`)}
      style={{ '--biz': accentColor(accent) } as React.CSSProperties}>
      <div className="biz__head">
        <span className="biz__num" style={{ background: accentGrad(accent) }}>{b.id}</span>
        <span className="biz__name truncate">{b.name}</span>
        <Pill tone={b.stage === 'build' ? undefined : 'positive'} inset>{STAGE_LABEL[b.stage]}</Pill>
      </div>
      <div className="biz__bar">
        <span className="biz__label">Build</span>
        <Bar pct={b.buildBar.pct / 100} fill={accentGrad(accent)} />
        <span className="biz__pct">{b.buildBar.pct}%</span>
      </div>
      <div className="biz__bar">
        <span className="biz__label">Automation</span>
        <Bar pct={b.automationBar.pct / 100} fill="var(--text)" />
        <span className="biz__pct">{b.automationBar.pct}%</span>
      </div>
      <div className="biz__next truncate">{b.nextSteps[0] ? `Next: ${b.nextSteps[0]}` : 'No next step written'}</div>
    </button>
  )
}

export function Board({ onGo }: { onGo: (r: string) => void }) {
  const s = useAppState()
  const t = s.totals
  const now = today()
  const upcoming = occurrences(s.payments, now, addDays(now, 60)).filter((o) => !o.paid)
  const nextPay = upcoming[0]
  const openTodos = s.todos.filter((x) => !x.done).length
  const avgBuild = Math.round(s.businesses.reduce((a, b) => a + b.buildBar.pct, 0) / s.businesses.length)

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="page-head">
        <Eyebrow>Holding · {s.businesses.length} businesses</Eyebrow>
        <h1>Board</h1>
      </header>

      <Card hero>
        <div className="hero">
          <Ring pct={t.revenueMtdUsd / s.goalMonthlyUsd} value={`$${compact(t.revenueMtdUsd)}`} label={`of $${compact(s.goalMonthlyUsd)}`} />
          <div className="hero__stats">
            <Stat label="Revenue this month" value={money(t.revenueMtdUsd)} sub="Stage 1 goal: $100k / mo revenue" large />
            <Stat label="Built" value={`${t.built} / ${s.businesses.length}`} sub={`average Build ${avgBuild}%`} />
            <Stat label="Automated" value={`${t.automated} / ${s.businesses.length}`} sub="Automation bar at 100%" />
            <Stat label="Ad spend this month" value={money(t.adSpendMtdUsd)} sub="you approve every dollar" />
            <Stat label="Fixed costs / mo" value={money(t.monthlyCostsUsd)}
              sub={t.unpricedPayments ? `${t.unpricedPayments} payments have no amount yet` : 'all payments priced'} />
            <Stat label="Next payment" value={nextPay ? shortDate(nextPay.date) : 'none dated'}
              sub={nextPay ? `${nextPay.payment.name}${nextPay.payment.amount !== null ? `, ${inCurrency(nextPay.payment.amount, nextPay.payment.currency)}` : ''}` : 'add due dates on Payments'} />
            <Stat label="Open to-dos" value={openTodos} sub={<button className="link" onClick={() => onGo('todos')}>open the list</button>} />
            <Stat label="Your minutes / week" value={t.minutesPerWeek || 'not logged'} sub="the honest automation gauge" />
          </div>
        </div>
      </Card>

      {ENGINES.map((e) => {
        const list = s.businesses.filter((b) => b.engine === e)
        if (!list.length) return null
        return (
          <section key={e} className="col" style={{ gap: 'var(--s-3)' }}>
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              <span className="dot" style={{ background: accentColor(ENGINE_ACCENT[e]) }} />
              <Eyebrow>{ENGINE_LABEL[e]}</Eyebrow>
            </div>
            <div className="biz-grid">
              {list.map((b) => <BizCard key={b.file} b={b} onGo={onGo} />)}
            </div>
          </section>
        )
      })}

      {upcoming.length > 0 && (
        <Card title="Next payments">
          <div className="col" style={{ gap: 'var(--s-2)' }}>
            {upcoming.slice(0, 5).map((o) => (
              <div key={`${o.payment.id}-${o.date}`} className="row row--between">
                <span>{shortDate(o.date)} · {o.payment.name}</span>
                <span className="muted">{o.payment.amount === null ? 'amount?' : `${inCurrency(o.payment.amount, o.payment.currency)} (${money(toUsd(o.payment, s.payments) ?? 0)})`}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
