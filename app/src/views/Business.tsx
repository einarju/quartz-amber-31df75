import { useState } from 'react'
import type { Business, CheckItem, MoneyField } from '@shared/schema.ts'
import { ACCOUNT_KINDS, ENGINE_ACCENT, ENGINE_LABEL, MONEY_FIELDS } from '@shared/schema.ts'
import { Bar, Btn, Card, Check, Empty, Eyebrow, Pill, accentGrad } from '../components/ui.tsx'
import { isImproving } from '@shared/core.ts'
import { addImprovement, setBusinessField, toggleBusiness } from '../lib/api.ts'
import { useAppState, useStore } from '../lib/store.tsx'
import { STAGE_LABEL } from './Board.tsx'

const FIELD_LABEL: Record<MoneyField, string> = {
  revenue_mtd_usd: 'Revenue this month (USD)',
  ad_spend_mtd_usd: 'Ad spend this month (USD)',
  costs_monthly_usd: 'Monthly costs (USD)',
  minutes_per_week: 'Your minutes per week',
}

function Checklist({ title, items, file, accentFill, pct }: {
  title: string; items: CheckItem[]; file: string; accentFill: string; pct: number
}) {
  const { run } = useStore()
  return (
    <Card title={title} actions={<span className="biz__pct">{pct}%</span>}>
      <Bar pct={pct / 100} fill={accentFill} thick />
      <div className="col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
        {items.length === 0 && <Empty>No items yet. Add lines like "- [ ] task" to the file.</Empty>}
        {items.map((i) => (
          <Check key={i.line} label={i.text} checked={i.done}
            onChange={() => { void run(() => toggleBusiness(file, i.line)) }} />
        ))}
      </div>
    </Card>
  )
}

/**
 * A finished Build or Automation list once the business is improving: one quiet line that
 * says it is complete, the checklist still there (and still clickable) behind a disclosure.
 */
function DoneChecklist({ title, items, file }: { title: string; items: CheckItem[]; file: string }) {
  const { run } = useStore()
  const done = items.filter((i) => i.done).length
  return (
    <details className="card done-list">
      <summary className="done-list__head">
        <span className="done-list__title">{title}</span>
        <span className="muted small grow">complete, {done}/{items.length}</span>
        <span className="biz__pct">100%</span>
      </summary>
      <div className="col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
        {items.map((i) => (
          <Check key={i.line} label={i.text} checked={i.done}
            onChange={() => { void run(() => toggleBusiness(file, i.line)) }} />
        ))}
      </div>
    </details>
  )
}

/**
 * Workflow upgrades that never block Build or Automation. Before a business is improving they
 * don't move any visible bar; once Build and Automation are both 100% this list becomes the
 * business's bar, drawn in teal.
 */
function Improvements({ b }: { b: Business }) {
  const { run } = useStore()
  const [text, setText] = useState('')
  const improving = isImproving(b)
  const ib = b.improvementsBar
  const open = ib.total - ib.done
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    void run(() => addImprovement(b.file, text))
    setText('')
  }
  return (
    <Card title={improving ? <span className="improve-ink">Improvements</span> : 'Improvements'}
      className={improving ? 'card--improve' : ''}
      actions={improving
        ? <span className="row" style={{ gap: 'var(--s-3)' }}><span className="muted small">{ib.done}/{ib.total} done</span><span className="biz__pct improve-ink">{ib.pct}%</span></span>
        : <span className="muted small">{open} open · not counted in progress</span>}>
      {improving && (
        <>
          <Bar pct={ib.pct / 100} fill="var(--improve-grad)" thick />
          {ib.next.length > 0 && (
            <div className="improve-next">
              <Eyebrow>Next up</Eyebrow>
              <ol className="steps">{ib.next.map((n) => <li key={n}>{n}</li>)}</ol>
            </div>
          )}
        </>
      )}
      <div className="col" style={{ gap: 'var(--s-2)', marginTop: improving ? 'var(--s-4)' : undefined }}>
        {b.improvements.length === 0 && <Empty>Nothing yet. Ideas that make a workflow better without blocking it go here.</Empty>}
        {b.improvements.map((i) => (
          <Check key={i.line} label={i.text} checked={i.done}
            onChange={() => { void run(() => toggleBusiness(b.file, i.line)) }} />
        ))}
      </div>
      <form className="row" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }} onSubmit={submit}>
        <input className="field field--sm grow" value={text} placeholder="Add an improvement" onChange={(e) => setText(e.target.value)} />
        <Btn size="sm" icon="plus" type="submit" disabled={!text.trim()}>Add</Btn>
      </form>
    </Card>
  )
}

function MoneyFields({ b }: { b: Business }) {
  const { run } = useStore()
  const [draft, setDraft] = useState<Record<string, string>>({})
  return (
    <Card title="Numbers">
      <div className="col" style={{ gap: 'var(--s-3)' }}>
        {MONEY_FIELDS.map((k) => {
          const shown = draft[k] ?? (b.money[k] === null ? '' : String(b.money[k]))
          const save = () => {
            if (draft[k] === undefined) return
            const v = draft[k]!.trim()
            void run(() => setBusinessField(b.file, k, v === '' ? null : Number(v)))
            setDraft(({ [k]: _drop, ...rest }) => rest)
          }
          return (
            <label key={k} className="row row--between" style={{ gap: 'var(--s-3)' }}>
              <span className="muted">{FIELD_LABEL[k]}</span>
              <input className="field field--sm field--num" style={{ width: 120 }} inputMode="decimal"
                value={shown} placeholder="not set"
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            </label>
          )
        })}
      </div>
    </Card>
  )
}

export function BusinessView({ file, onGo }: { file: string; onGo: (r: string) => void }) {
  const s = useAppState()
  const b = s.businesses.find((x) => x.file === file)
  if (!b) return <Empty>No business file {file}. <button className="link" onClick={() => onGo('board')}>Back to the board</button></Empty>
  const fill = accentGrad(ENGINE_ACCENT[b.engine])

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="page-head">
        <div className="row" style={{ gap: 'var(--s-3)' }}>
          <Btn icon="chevronLeft" size="sm" title="Back to the board" onClick={() => onGo('board')} />
          <Eyebrow>#{b.id} · {ENGINE_LABEL[b.engine]}{b.brand ? ` · ${b.brand}` : ''}</Eyebrow>
        </div>
        <div className="row" style={{ gap: 'var(--s-3)', flexWrap: 'wrap' }}>
          <h1>{b.name}</h1>
          <Pill tone={b.stage === 'build' ? 'accent' : 'positive'}>{STAGE_LABEL[b.stage]}</Pill>
          {b.url && /^https?:/.test(b.url) && (
            <a className="link" href={b.url.split(' ')[0]} target="_blank" rel="noreferrer">{b.url.split(' ')[0]}</a>
          )}
        </div>
        {b.summary && <p className="lede">{b.summary}</p>}
        {b.moneyFrom && <p className="muted">Money from: {b.moneyFrom}</p>}
      </header>

      {isImproving(b) ? (
        <>
          <Improvements b={b} />
          <div className="grid grid--2">
            <DoneChecklist title="Build" items={b.build} file={b.file} />
            <DoneChecklist title="Automation" items={b.automation} file={b.file} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid--2">
            <Checklist title="Build" items={b.build} file={b.file} accentFill={fill} pct={b.buildBar.pct} />
            <Checklist title="Automation" items={b.automation} file={b.file} accentFill="var(--text)" pct={b.automationBar.pct} />
          </div>

          <Improvements b={b} />
        </>
      )}

      <div className="grid grid--3">
        <Card title="Next steps">
          {b.nextSteps.length === 0 ? <Empty>None written.</Empty> : (
            <ol className="steps">{b.nextSteps.map((n) => <li key={n}>{n}</li>)}</ol>
          )}
        </Card>
        <MoneyFields b={b} />
        <Card title="Accounts" actions={<a className="link small" href="#accounts">edit in The 11</a>}>
          {b.accounts.length === 0 ? <Empty>None listed yet.</Empty> : (
            <table className="table">
              <tbody>
                {b.accounts.map((a) => (
                  <tr key={a.kind}>
                    <td className="muted">{ACCOUNT_KINDS.find((k) => k.id === a.kind)?.label ?? a.kind}</td>
                    <td className="truncate" style={{ maxWidth: 180 }}>{a.value}</td>
                    <td className="num"><Pill tone={a.status === 'live' ? 'positive' : a.status === 'created' ? 'warn' : undefined} inset>
                      {a.status === 'planned' ? 'to make' : a.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {b.notes && <Card title="Notes"><p className="pre">{b.notes}</p></Card>}
      <p className="muted small">File: businesses/{b.file}{b.repo ? ` · repo ${b.repo}` : ''}</p>
    </div>
  )
}
