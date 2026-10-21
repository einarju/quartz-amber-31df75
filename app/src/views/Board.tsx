import type { Business, Engine } from '@shared/schema.ts'
import { ENGINE_ACCENT, ENGINE_LABEL } from '@shared/schema.ts'
import { Card, Eyebrow, Ring, Stat, accentColor } from '../components/ui.tsx'
import { compact, inCurrency, money } from '../lib/format.ts'
import { occurrences, shortDate, today, addDays, toUsd } from '../lib/dates.ts'
import { useAppState } from '../lib/store.tsx'

const ENGINES: Engine[] = ['visual', 'ableton', 'audience', 'launch', 'sandbox']

export const STAGE_LABEL = { build: 'Building', automation: 'Automating', 'self-running': 'Self-running' } as const

const SEGMENTS = 16

/** One LED column. Any progress above zero lights at least one segment, so 5% still shows. */
function Meter({ pct, color, label }: { pct: number; color: string; label: string }) {
  const lit = pct > 0 ? Math.max(1, Math.round((pct / 100) * SEGMENTS)) : 0
  return (
    <div className="meter" aria-label={`${label} ${pct}%`} role="img" style={{ '--c': color } as React.CSSProperties}>
      {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} data-on={i < lit} />)}
    </div>
  )
}

/** A mixing-console channel strip per business: number, engine colour, Build and Automation meters. */
export function Strip({ b, onGo }: { b: Business; onGo: (r: string) => void }) {
  const color = accentColor(ENGINE_ACCENT[b.engine])
  return (
    <button type="button" className="strip" data-quarantine={b.engine === 'sandbox'}
      style={{ '--eng': color } as React.CSSProperties}
      title={`#${b.id} ${b.name} · ${STAGE_LABEL[b.stage]}${b.nextSteps[0] ? `
Next: ${b.nextSteps[0]}` : ''}`}
      onClick={() => onGo(`biz/${b.file}`)}>
      <span className="strip__num">{b.id}</span>
      <span className="strip__chip" />
      <span className="strip__meters">
        <Meter pct={b.buildBar.pct} color={color} label="Build" />
        <Meter pct={b.automationBar.pct} color="var(--text)" label="Automation" />
      </span>
      <span className="strip__readout">
        <span>B <b>{b.buildBar.pct}</b></span>
        <span>A <b>{b.automationBar.pct}</b></span>
      </span>
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


      <Card title="The board" actions={<span className="muted small">B = Build · A = Automation · click a channel</span>}>
        <div className="console-scroll">
          <div className="console">
            {s.businesses.map((b) => <Strip key={b.file} b={b} onGo={onGo} />)}
          </div>
        </div>
        <div className="console-key">
          {ENGINES.map((e) => (
            <div key={e} className="console-key__group">
              <span className="row" style={{ gap: 'var(--s-2)' }}>
                <span className="dot" style={{ background: accentColor(ENGINE_ACCENT[e]) }} />
                <Eyebrow>{ENGINE_LABEL[e]}</Eyebrow>
              </span>
              {s.businesses.filter((b) => b.engine === e).map((b) => (
                <button key={b.file} type="button" className="link console-key__item" onClick={() => onGo(`biz/${b.file}`)}>
                  <b>{b.id}</b> {b.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>

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
