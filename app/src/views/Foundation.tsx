import type { CheckItem } from '@shared/schema.ts'
import { Bar, Card, Check, Eyebrow } from '../components/ui.tsx'
import { toggleFoundation } from '../lib/api.ts'
import { bar } from '../lib/bar.ts'
import { useAppState, useStore } from '../lib/store.tsx'

function List({ items }: { items: CheckItem[] }) {
  const { run } = useStore()
  return (
    <div className="col" style={{ gap: 'var(--s-2)' }}>
      {items.map((i) => (
        <Check key={i.line} label={i.text.replace(/^\d+\.\s*/, '')} checked={i.done}
          onChange={() => { void run(() => toggleFoundation(i.line)) }} />
      ))}
    </div>
  )
}

export function FoundationView() {
  const f = useAppState().foundation
  const steps = bar(f.steps)
  const [head, ...rows] = f.approvals

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="page-head">
        <Eyebrow>Shared plumbing, built once</Eyebrow>
        <h1>Foundation</h1>
      </header>

      <Card title="Do in order" actions={<span className="biz__pct">{steps.done} / {steps.total}</span>}>
        <Bar pct={steps.pct / 100} thick />
        <div style={{ marginTop: 'var(--s-4)' }}><List items={f.steps} /></div>
      </Card>

      {head && (
        <Card title="Long-lead approvals">
          <div className="table__scroll">
            <table className="table">
              <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Identity kit (template for every business)">
        <List items={f.kit} />
      </Card>
    </div>
  )
}
