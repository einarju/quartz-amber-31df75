import { useEffect, useRef, useState } from 'react'
import type { Cadence, Payment } from '@shared/schema.ts'
import { Btn, Card, Eyebrow } from '../components/ui.tsx'
import { payPayment, removePayment, savePayment } from '../lib/api.ts'
import { MONTHS, iso, occurrences, parse, today } from '../lib/dates.ts'
import { inCurrency } from '../lib/format.ts'
import { useAppState, useStore } from '../lib/store.tsx'

const BLANK: Partial<Payment> = { name: '', amount: null, currency: 'USD', cadence: 'monthly', next_due: null, business: 'shared', card: '', note: '', active: true }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** `inline` is the always-open "add a new payment" form under the calendar: no close button, no jump-scroll. */
function Editor({ value, onClose, inline = false }: { value: Partial<Payment>; onClose: () => void; inline?: boolean }) {
  const s = useAppState()
  const { run } = useStore()
  const [p, setP] = useState<Partial<Payment>>(value)
  const set = <K extends keyof Payment>(k: K, v: Payment[K]) => setP({ ...p, [k]: v })
  const save = () => { void run(() => savePayment(p)).then(onClose) }
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (inline) return
    // the editor renders at the top of the page while "Fill in" / "Edit" sit far below; bring it into view
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const empty = [...(box.current?.querySelectorAll<HTMLInputElement>('input:not([disabled])') ?? [])].find((i) => !i.value)
    ;(empty ?? box.current?.querySelector<HTMLInputElement>('input:not([disabled])'))?.focus({ preventScroll: true })
  }, [inline])

  return (
    <div ref={box}>
    <Card title={value.id ? `Edit ${value.name}` : 'Add a new payment'} actions={inline ? undefined : <Btn icon="x" size="sm" title="Close" onClick={onClose} />}>
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
        {value.id && value.next_due && <Btn icon="check" onClick={() => { void run(() => payPayment(value.id!)).then(onClose) }}>Mark {value.next_due} paid</Btn>}
        {value.id && <Btn variant="ghost" icon="trash" onClick={() => { void run(() => removePayment(value.id!)).then(onClose) }}>Delete</Btn>}
      </div>
    </Card>
    </div>
  )
}

export function Payments() {
  const s = useAppState()
  const now = today()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [editing, setEditing] = useState<Payment | null>(null)
  const [fresh, setFresh] = useState(0) // bumped after each add so the new-payment form starts blank again

  const first = iso(month)
  const last = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const occ = occurrences(s.payments, first, last)
  const lead = (month.getDay() + 6) % 7 // Monday-first offset
  const days = parse(last).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))]
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="page-head"><Eyebrow>Calendar of payments</Eyebrow><h1>Payments</h1></header>

      {editing && <Editor key={editing.id} value={editing} onClose={() => setEditing(null)} />}

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

      <Editor key={`new${fresh}`} value={BLANK} inline onClose={() => setFresh(fresh + 1)} />
    </div>
  )
}
