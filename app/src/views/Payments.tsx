import { useState } from 'react'
import type { Cadence, Payment } from '@shared/schema.ts'
import { Btn, Card, Empty, Eyebrow, Pill, Stat } from '../components/ui.tsx'
import { payPayment, removePayment, savePayment } from '../lib/api.ts'
import { MONTHS, addDays, iso, occurrences, parse, shortDate, today, toUsd } from '../lib/dates.ts'
import { inCurrency, money } from '../lib/format.ts'
import { useAppState, useStore } from '../lib/store.tsx'

const BLANK: Partial<Payment> = { name: '', amount: null, currency: 'USD', cadence: 'monthly', next_due: null, business: 'shared', card: '', note: '', active: true }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Editor({ value, onClose }: { value: Partial<Payment>; onClose: () => void }) {
  const s = useAppState()
  const { run } = useStore()
  const [p, setP] = useState<Partial<Payment>>(value)
  const set = <K extends keyof Payment>(k: K, v: Payment[K]) => setP({ ...p, [k]: v })
  const save = () => { void run(() => savePayment(p)).then(onClose) }

  return (
    <Card title={value.id ? `Edit ${value.name}` : 'New payment'} actions={<Btn icon="x" size="sm" title="Close" onClick={onClose} />}>
      <div className="pay-form">
        <label>Name<input className="field field--sm" value={p.name ?? ''} disabled={!!value.id} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Amount<input className="field field--sm field--num" inputMode="decimal" value={p.amount ?? ''} placeholder="not set"
          onChange={(e) => set('amount', e.target.value === '' ? null : Number(e.target.value))} /></label>
        <label>Currency<select className="field field--sm" value={p.currency} onChange={(e) => set('currency', e.target.value as Payment['currency'])}>
          <option>USD</option><option>MXN</option><option>EUR</option></select></label>
        <label>Repeats<select className="field field--sm" value={p.cadence} onChange={(e) => set('cadence', e.target.value as Cadence)}>
          <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="weekly">Weekly</option><option value="once">Once</option></select></label>
        <label>Next due<input className="field field--sm" type="date" value={p.next_due ?? ''} onChange={(e) => set('next_due', e.target.value || null)} /></label>
        <label>Business<select className="field field--sm" value={p.business} onChange={(e) => set('business', e.target.value)}>
          <option value="shared">Shared</option><option value="personal">Personal</option>
          {s.businesses.map((b) => <option key={b.id} value={String(b.id)}>#{b.id} {b.name}</option>)}</select></label>
        <label>Card<input className="field field--sm" value={p.card ?? ''} placeholder="which card pays it" onChange={(e) => set('card', e.target.value)} /></label>
        <label className="pay-form__wide">Note<input className="field field--sm" value={p.note ?? ''} onChange={(e) => set('note', e.target.value)} /></label>
        <label className="row" style={{ gap: 'var(--s-2)' }}><input type="checkbox" checked={p.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active</label>
      </div>
      <div className="row" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
        <Btn variant="accent" icon="check" onClick={save} disabled={!p.name?.trim()}>Save</Btn>
        {value.id && <Btn variant="ghost" icon="trash" onClick={() => { void run(() => removePayment(value.id!)).then(onClose) }}>Delete</Btn>}
      </div>
    </Card>
  )
}

export function Payments() {
  const s = useAppState()
  const { run } = useStore()
  const now = today()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [editing, setEditing] = useState<Partial<Payment> | null>(null)

  const first = iso(month)
  const last = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const occ = occurrences(s.payments, first, last)
  const lead = (month.getDay() + 6) % 7 // Monday-first offset
  const days = parse(last).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))]
  const monthDue = occ.filter((o) => !o.paid).reduce((a, o) => a + (toUsd(o.payment, s.payments) ?? 0), 0)

  const upcoming = occurrences(s.payments, addDays(now, -7), addDays(now, 30)).filter((o) => !o.paid && o.next)
  const missing = s.payments.payments.filter((p) => p.active && (p.amount === null || !p.next_due))
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="row row--between" style={{ alignItems: 'flex-end' }}>
        <div className="page-head"><Eyebrow>Calendar of payments</Eyebrow><h1>Payments</h1></div>
        <Btn variant="accent" icon="plus" onClick={() => setEditing(BLANK)}>Add payment</Btn>
      </header>

      {editing && <Editor key={editing.id ?? 'new'} value={editing} onClose={() => setEditing(null)} />}

      <div className="grid grid--3">
        <Stat label="Fixed costs / mo" value={money(s.totals.monthlyCostsUsd)} sub="recurring, converted to USD" large />
        <Stat label={`Due in ${MONTHS[month.getMonth()]}`} value={money(monthDue)} sub={`${occ.filter((o) => !o.paid).length} payments`} large />
        <Stat label="Need filling in" value={missing.length} sub="no amount or no due date" large />
      </div>

      <Card title={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}
        actions={<div className="row" style={{ gap: 'var(--s-2)' }}>
          <Btn icon="chevronLeft" size="sm" title="Previous month" onClick={() => shift(-1)} />
          <Btn size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Btn>
          <Btn icon="chevronRight" size="sm" title="Next month" onClick={() => shift(1)} />
        </div>}>
        <div className="cal">
          {DOW.map((d) => <div key={d} className="cal__dow">{d}</div>)}
          {cells.map((d, i) => d === null ? <div key={`x${i}`} className="cal__cell cal__cell--empty" /> : (
            <div key={d} className="cal__cell" data-today={d === now}>
              <span className="cal__day">{parse(d).getDate()}</span>
              {occ.filter((o) => o.date === d).map((o) => (
                <button key={o.payment.id} type="button" className="chip" data-paid={o.paid}
                  title={`${o.payment.name}${o.paid ? ' (paid)' : ''}`} onClick={() => setEditing(o.payment)}>
                  <span className="truncate">{o.payment.name}</span>
                  {o.payment.amount !== null && <b>{inCurrency(o.payment.amount, o.payment.currency)}</b>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <Card title="Due in the next 30 days">
          {upcoming.length === 0 ? <Empty>Nothing dated in the next 30 days.</Empty> : (
            <div className="col" style={{ gap: 'var(--s-2)' }}>
              {upcoming.map((o) => (
                <div key={o.payment.id} className="row row--between" style={{ gap: 'var(--s-3)' }}>
                  <span className="grow truncate">{shortDate(o.date)} · {o.payment.name}</span>
                  {o.date < now && <Pill tone="negative" inset>overdue</Pill>}
                  <span className="muted">{o.payment.amount === null ? 'amount?' : inCurrency(o.payment.amount, o.payment.currency)}</span>
                  <Btn size="sm" icon="check" onClick={() => { void run(() => payPayment(o.payment.id)) }}>Paid</Btn>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Need filling in">
          {missing.length === 0 ? <Empty>Every payment has an amount and a date.</Empty> : (
            <div className="col" style={{ gap: 'var(--s-2)' }}>
              {missing.map((p) => (
                <div key={p.id} className="row row--between" style={{ gap: 'var(--s-3)' }}>
                  <span className="grow truncate">{p.name}</span>
                  <span className="muted small">{[p.amount === null && 'amount', !p.next_due && 'due date'].filter(Boolean).join(' + ')}</span>
                  <Btn size="sm" onClick={() => setEditing(p)}>Fill in</Btn>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="All payments">
        <div className="table__scroll">
          <table className="table">
            <thead><tr><th>Name</th><th>Business</th><th>Repeats</th><th>Next due</th><th className="num">Amount</th><th className="num">USD / mo</th><th /></tr></thead>
            <tbody>
              {s.payments.payments.map((p) => {
                const usd = toUsd(p, s.payments)
                const perMonth = usd === null || p.cadence === 'once' ? null : p.cadence === 'yearly' ? usd / 12 : p.cadence === 'weekly' ? (usd * 52) / 12 : usd
                return (
                  <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                    <td>{p.name}{p.note && <div className="muted small">{p.note}</div>}</td>
                    <td>{p.business === 'shared' || p.business === 'personal' ? p.business : `#${p.business}`}</td>
                    <td>{p.cadence}</td>
                    <td>{p.next_due ? shortDate(p.next_due) : <span className="muted">not set</span>}</td>
                    <td className="num">{p.amount === null ? <span className="muted">?</span> : inCurrency(p.amount, p.currency, 2)}</td>
                    <td className="num">{perMonth === null ? '' : money(perMonth, true)}</td>
                    <td className="num"><Btn size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Btn></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 'var(--s-3)' }}>Rates: 1 USD = {s.payments.usd_mxn} MXN, 1 EUR = {s.payments.eur_usd} USD (edit in payments.md).</p>
      </Card>
    </div>
  )
}
