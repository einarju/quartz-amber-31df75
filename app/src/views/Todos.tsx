import { useState } from 'react'
import type { Todo } from '@shared/schema.ts'
import { ENGINE_ACCENT } from '@shared/schema.ts'
import { Btn, Card, Check, Empty, Eyebrow, Pill, accentColor } from '../components/ui.tsx'
import { addTodo, deleteTodo, toggleTodo } from '../lib/api.ts'
import { shortDate, today } from '../lib/dates.ts'
import { useAppState, useStore } from '../lib/store.tsx'

function sortOpen(a: Todo, b: Todo): number {
  if (a.due && b.due) return a.due.localeCompare(b.due)
  if (a.due) return -1
  if (b.due) return 1
  return a.line - b.line
}

export function Todos({ onGo }: { onGo: (r: string) => void }) {
  const s = useAppState()
  const { run } = useStore()
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [biz, setBiz] = useState('')
  const [showDone, setShowDone] = useState(false)
  const now = today()
  const open = s.todos.filter((t) => !t.done).sort(sortOpen)
  const done = s.todos.filter((t) => t.done)
  const bizName = (n: number | null) => s.businesses.find((b) => b.id === n)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    void run(() => addTodo(text, due || null, biz ? Number(biz) : null))
    setText(''); setDue('')
  }

  const row = (t: Todo) => {
    const b = bizName(t.business)
    const late = t.due !== null && t.due < now && !t.done
    return (
      <div key={t.line} className="row" style={{ gap: 'var(--s-2)' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <Check label={t.text} checked={t.done} onChange={() => { void run(() => toggleTodo(t.line)) }}
            meta={(
              <span className="row" style={{ gap: 'var(--s-2)' }}>
                {b && <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: accentColor(ENGINE_ACCENT[b.engine]) }} />#{b.id}</span>}
                {t.due && <Pill tone={late ? 'negative' : t.due === now ? 'warn' : undefined} inset>{late ? 'late · ' : ''}{shortDate(t.due)}</Pill>}
              </span>
            )} />
        </div>
        <Btn icon="trash" size="sm" variant="ghost" title="Delete" onClick={() => { void run(() => deleteTodo(t.line)) }} />
      </div>
    )
  }

  const withSteps = s.businesses.filter((b) => b.nextSteps.length)

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="page-head">
        <Eyebrow>{open.length} open · {done.length} done</Eyebrow>
        <h1>To-dos</h1>
      </header>

      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <Card title="Your list">
          <form className="todo-form" onSubmit={submit}>
            <input className="field" placeholder="Add a to-do" value={text} onChange={(e) => setText(e.target.value)} aria-label="To-do" />
            <input className="field field--sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            <select className="field field--sm" value={biz} onChange={(e) => setBiz(e.target.value)} aria-label="Business">
              <option value="">No business</option>
              {s.businesses.map((b) => <option key={b.id} value={b.id}>#{b.id} {b.name}</option>)}
            </select>
            <Btn type="submit" variant="accent" icon="plus">Add</Btn>
          </form>
          <div className="col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
            {open.length === 0 && <Empty>Nothing open. Add the next thing above.</Empty>}
            {open.map(row)}
          </div>
          {done.length > 0 && (
            <div style={{ marginTop: 'var(--s-4)' }}>
              <button className="link" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} {done.length} done</button>
              {showDone && <div className="col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>{done.map(row)}</div>}
            </div>
          )}
        </Card>

        <Card title="Next steps from the businesses">
          <div className="col" style={{ gap: 'var(--s-4)' }}>
            {withSteps.map((b) => (
              <div key={b.file} className="col" style={{ gap: 'var(--s-1)' }}>
                <button className="link row" style={{ gap: 'var(--s-2)' }} onClick={() => onGo(`biz/${b.file}`)}>
                  <span className="dot" style={{ background: accentColor(ENGINE_ACCENT[b.engine]) }} />#{b.id} {b.name}
                </button>
                <ul className="steps">{b.nextSteps.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
