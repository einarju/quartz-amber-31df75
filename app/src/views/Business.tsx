import { useState } from 'react'
import type { Business, CheckItem, MoneyField } from '@shared/schema.ts'
import { ENGINE_ACCENT, ENGINE_LABEL, MONEY_FIELDS } from '@shared/schema.ts'
import { Bar, Btn, Card, Check, Empty, Eyebrow, Pill, accentGrad } from '../components/ui.tsx'
import { setBusinessField, toggleBusiness } from '../lib/api.ts'
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

      <div className="grid grid--2">
        <Checklist title="Build" items={b.build} file={b.file} accentFill={fill} pct={b.buildBar.pct} />
        <Checklist title="Automation" items={b.automation} file={b.file} accentFill="var(--text)" pct={b.automationBar.pct} />
      </div>

      <div className="grid grid--3">
        <Card title="Next steps">
          {b.nextSteps.length === 0 ? <Empty>None written.</Empty> : (
            <ol className="steps">{b.nextSteps.map((n) => <li key={n}>{n}</li>)}</ol>
          )}
        </Card>
        <MoneyFields b={b} />
        <Card title="Accounts">
          <table className="table">
            <tbody>
              {b.accounts.map((a) => (
                <tr key={a.key}>
                  <td className="muted">{a.key.replace(/_/g, ' ')}</td>
                  <td className="num"><Pill tone={a.value.startsWith('live') ? 'positive' : a.value.startsWith('none') ? undefined : 'warn'} inset>{a.value}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {b.notes && <Card title="Notes"><p className="pre">{b.notes}</p></Card>}
      <p className="muted small">File: businesses/{b.file}{b.repo ? ` · repo ${b.repo}` : ''}</p>
    </div>
  )
}
