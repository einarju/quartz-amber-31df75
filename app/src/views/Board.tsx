import type { Business, Engine } from '@shared/schema.ts'
import { ENGINE_ACCENT, ENGINE_LABEL } from '@shared/schema.ts'
import { Card, Eyebrow, Ring, Stat, accentColor } from '../components/ui.tsx'
import { compact, inCurrency, money } from '../lib/format.ts'
import { occurrences, shortDate, today, addDays, toUsd } from '../lib/dates.ts'
import { useAppState } from '../lib/store.tsx'

const ENGINES: Engine[] = ['visual', 'ableton', 'audience', 'launch', 'sandbox']

export const STAGE_LABEL = { build: 'Building', automation: 'Automating', 'self-running': 'Self-running' } as const

const SEGMENTS = 16

/**
 * One LED column. Any progress above zero lights at least one segment, so 5% still shows.
 * The lit segments are the real value; the dim peak light that dances above them is decoration.
 */
function Meter({ pct, color, label, seed }: { pct: number; color: string; label: string; seed: number }) {
  const lit = pct > 0 ? Math.max(1, Math.round((pct / 100) * SEGMENTS)) : 0
  return (
    <div className="meter" aria-label={`${label} ${pct}%`} role="img"
      style={{ '--c': color, '--peak': lit, '--seed': seed } as React.CSSProperties}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <i key={i} data-on={i < lit} style={{ '--i': i } as React.CSSProperties} />
      ))}
      {lit < SEGMENTS && <b className="meter__peak" aria-hidden="true" />}
    </div>
  )
}

/** Always-moving signal lines, one per engine colour. Purely decorative. */
const WAVES = [
  { color: 'orange', k: [3, 7], amp: [14, 6], dur: 9 },
  { color: 'cyan', k: [4, 9], amp: [11, 5], dur: 12 },
  { color: 'pink', k: [5, 2], amp: [9, 8], dur: 15 },
  { color: 'lime', k: [6, 11], amp: [7, 3], dur: 7 },
  { color: 'violet', k: [2, 5], amp: [5, 4], dur: 19 },
]

function wavePath(k: number[], amp: number[]): string {
  // Spans two viewBox widths with periods that divide 1000, so shifting it left by half loops seamlessly.
  const pts: string[] = []
  for (let x = 0; x <= 2000; x += 8) {
    const y = 40 + amp[0]! * Math.sin((2 * Math.PI * k[0]! * x) / 1000) + amp[1]! * Math.sin((2 * Math.PI * k[1]! * x) / 1000 + 1.3)
    pts.push(`${x},${y.toFixed(1)}`)
  }
  return `M${pts.join(' L')}`
}

function Scope() {
  return (
    <div className="scope" aria-hidden="true">
      <svg viewBox="0 0 1000 80" preserveAspectRatio="none">
        {WAVES.map((w) => (
          <path key={w.color} d={wavePath(w.k, w.amp)} stroke={`var(--${w.color})`}
            style={{ animationDuration: `${w.dur}s`, color: `var(--${w.color})` }} />
        ))}
      </svg>
    </div>
  )
}

/** A mixing-console channel strip per business: number, engine colour, Build and Automation meters. */
export function Strip({ b, onGo, idx }: { b: Business; onGo: (r: string) => void; idx: number }) {
  const color = accentColor(ENGINE_ACCENT[b.engine])
  return (
    <button type="button" className="strip" data-quarantine={b.engine === 'sandbox'}
      style={{ '--eng': color, '--idx': idx } as React.CSSProperties}
      title={`#${b.id} ${b.name} · ${STAGE_LABEL[b.stage]}${b.nextSteps[0] ? `
Next: ${b.nextSteps[0]}` : ''}`}
      onClick={() => onGo(`biz/${b.file}`)}>
      <span className="strip__num">{b.id}</span>
      <span className="strip__chip" />
      <span className="strip__meters">
        <Meter pct={b.buildBar.pct} color={color} label="Build" seed={idx * 2} />
        <Meter pct={b.automationBar.pct} color="var(--text)" label="Automation" seed={idx * 2 + 1} />
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
            {s.businesses.map((b, i) => <Strip key={b.file} b={b} onGo={onGo} idx={i} />)}
          </div>
        </div>
        <Scope />
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
