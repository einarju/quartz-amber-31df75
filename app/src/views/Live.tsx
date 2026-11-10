import { useEffect, useMemo, useState } from 'react'
import { ENGINE_ACCENT } from '@shared/schema.ts'
import { Btn, Card, Eyebrow, accentColor } from '../components/ui.tsx'
import { Icon } from '../components/Icon.tsx'
import { useAppState } from '../lib/store.tsx'
import {
  DEFAULT_RELAY, ago, isVideo, loadConn, saveConn, useLive, useTick,
} from '../lib/live.ts'
import type { Decision, LinkState, LiveConn, LiveEvent, LiveItem, LiveJob } from '../lib/live.ts'

/**
 * Live: talk once, watch, tap.
 *   left   the 11, glowing while an agent works on them
 *   centre what is running right now, as its real pipeline, clips landing as they render
 *   right  only what needs Einar: a card with the preview playing and 2-4 buttons
 */

const PULSE_MS = 90_000
const FILE_GLOW_MS = 10 * 60_000

const LINK_LABEL: Record<LinkState, string> = {
  off: 'not connected', connecting: 'connecting', live: 'live', offline: 'relay offline',
}

export function Live({ onGo }: { onGo: (r: string) => void }) {
  const [conn, setConn] = useState<LiveConn | null>(loadConn)
  const [editing, setEditing] = useState(false)
  const live = useLive(conn)
  const now = useTick(3000)

  const open = Object.values(live.decisions).filter((d) => d.status === 'open').sort((a, b) => a.created - b.created)

  // Open decisions show in the browser tab title, so a waiting card is visible from any other tab.
  useEffect(() => {
    const base = 'Holding'
    document.title = open.length ? `(${open.length}) ${base}` : base
    return () => { document.title = base }
  }, [open.length])

  if (!conn || editing) {
    return <Connect initial={conn} onSave={(c) => { saveConn(c); setConn(c); setEditing(false) }}
      onCancel={conn ? () => setEditing(false) : undefined} />
  }

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="page-head">
        <div className="row row--between">
          <Eyebrow>Holding · live</Eyebrow>
          <span className="row" style={{ gap: 'var(--s-3)' }}>
            <span className={`pill live-link live-link--${live.link}`}><span className="dot" />{LINK_LABEL[live.link]}</span>
            <Btn size="sm" variant="ghost" icon="gear" title="Relay connection" onClick={() => setEditing(true)} />
          </span>
        </div>
        <h1>Live</h1>
      </header>

      <div className="live">
        <TheEleven events={live.events} jobs={live.jobs} now={now} onGo={onGo} />
        <Stage jobs={live.jobs} events={live.events} now={now} />
        <Inbox open={open} all={Object.values(live.decisions)} now={now} onAnswer={live.answer} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- the 11 */

function TheEleven({ events, jobs, now, onGo }: {
  events: LiveEvent[]; jobs: Record<string, LiveJob>; now: number; onGo: (r: string) => void
}) {
  const s = useAppState()
  const last = useMemo(() => {
    const m = new Map<number, number>()
    for (const e of events) if (e.biz != null) m.set(e.biz, Math.max(m.get(e.biz) ?? 0, e.at))
    for (const j of Object.values(jobs)) if (j.biz != null) m.set(j.biz, Math.max(m.get(j.biz) ?? 0, j.updated))
    return m
  }, [events, jobs])

  return (
    <Card title="The 11" className="live__eleven" tight>
      <div className="eleven">
        {s.businesses.map((b) => {
          const at = last.get(b.id)
          const hot = at !== undefined && now - at < PULSE_MS
          return (
            <button key={b.file} type="button" className="eleven__row" data-hot={hot}
              style={{ '--eng': accentColor(ENGINE_ACCENT[b.engine]) } as React.CSSProperties}
              title={at ? `Last activity ${ago(at, now)} ago` : 'No live activity yet'}
              onClick={() => onGo(`biz/${b.file}`)}>
              <span className="eleven__num">{b.id}</span>
              <span className="eleven__name truncate">{b.name}</span>
              <span className="eleven__bars" aria-label={`Build ${b.buildBar.pct}%, Automation ${b.automationBar.pct}%`}>
                <i style={{ width: `${b.buildBar.pct}%` }} />
                <i style={{ width: `${b.automationBar.pct}%` }} />
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/* --------------------------------------------------------------- stage */

const STATUS_ORDER: Record<string, number> = { waiting: 0, running: 1, queued: 2, failed: 3, done: 4 }

function Stage({ jobs, events, now }: { jobs: Record<string, LiveJob>; events: LiveEvent[]; now: number }) {
  const list = Object.values(jobs)
    .sort((a, b) => (STATUS_ORDER[a.status]! - STATUS_ORDER[b.status]!) || b.updated - a.updated)
  const active = list.filter((j) => j.status !== 'done' && j.status !== 'failed')
  const recent = list.filter((j) => !active.includes(j)).slice(0, 3)

  return (
    <div className="col live__stage" style={{ gap: 'var(--gutter)' }}>
      {active.length === 0 && (
        <Card>
          <div className="empty">Nothing running. A job shows up here the moment it starts.</div>
        </Card>
      )}
      {active.map((j) => <JobCard key={j.id} job={j} now={now} />)}
      <FileMap events={events} now={now} />
      {recent.length > 0 && (
        <Card title="Finished" tight>
          <div className="col" style={{ gap: 'var(--s-2)' }}>
            {recent.map((j) => (
              <div key={j.id} className="row row--between small">
                <span className="row truncate" style={{ gap: 'var(--s-2)' }}>
                  <span className={`rundot ${j.status === 'failed' ? 'rundot--bad' : 'rundot--ok'}`} />
                  <span className="truncate">{j.title}</span>
                </span>
                <span className="muted">{j.note ? `${j.note} · ` : ''}{ago(j.updated, now)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function JobCard({ job, now }: { job: LiveJob; now: number }) {
  const waiting = job.status === 'waiting'
  return (
    <Card className="job" title={job.title} actions={
      <span className={`pill ${waiting ? 'pill--warn' : 'pill--accent'}`}>
        <span className={`rundot ${waiting ? 'rundot--wait' : 'rundot--run'}`} />
        {waiting ? 'needs you' : 'running'}{job.machine ? ` · ${job.machine}` : ''}
      </span>
    }>
      {job.stages.length > 0 && (
        <ol className="pipe" style={{ '--n': job.stages.length } as React.CSSProperties}>
          {job.stages.map((st, i) => {
            const state = i < job.stage ? 'done' : i === job.stage ? (waiting ? 'waiting' : 'active') : 'todo'
            return (
              <li key={st} className="pipe__node" data-state={state}>
                <span className="pipe__dot">{state === 'done' && <Icon name="check" size={12} />}</span>
                <span className="pipe__label">{st}</span>
              </li>
            )
          })}
        </ol>
      )}
      {job.note && <p className="muted small" style={{ marginTop: 'var(--s-3)' }}>{job.note} · updated {ago(job.updated, now)}</p>}
      {job.items.length > 0 && (
        <div className="tiles">
          {job.items.map((it) => <Tile key={it.id} item={it} />)}
        </div>
      )}
    </Card>
  )
}

function Tile({ item }: { item: LiveItem }) {
  const [hover, setHover] = useState(false)
  const showVideo = hover && isVideo(item.media)
  return (
    <figure className="tile" data-status={item.status}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="tile__media">
        {showVideo
          ? <video src={item.media} poster={item.thumb} autoPlay muted loop playsInline />
          : item.thumb ? <img src={item.thumb} alt="" loading="lazy" /> : null}
        {item.status === 'running' && <span className="tile__scan" />}
        {item.status === 'failed' && <span className="tile__badge tile__badge--bad"><Icon name="x" size={14} /></span>}
        {item.status === 'waiting' && <span className="tile__badge tile__badge--wait">!</span>}
      </div>
      <figcaption className="tile__cap">
        <span className="truncate">{item.label ?? item.id}</span>
        {item.note && <span className="tile__note truncate">{item.note}</span>}
      </figcaption>
    </figure>
  )
}

/** Files touched in the last 10 minutes, each glowing brighter the more recent its last touch. */
function FileMap({ events, now }: { events: LiveEvent[]; now: number }) {
  const files = useMemo(() => {
    const m = new Map<string, { at: number; n: number }>()
    for (const e of events) {
      if (e.kind !== 'file' || !e.path) continue
      const prev = m.get(e.path)
      m.set(e.path, { at: Math.max(prev?.at ?? 0, e.at), n: (prev?.n ?? 0) + 1 })
    }
    return [...m.entries()].filter(([, v]) => now - v.at < FILE_GLOW_MS).sort((a, b) => b[1].at - a[1].at).slice(0, 24)
  }, [events, now])
  const feed = events.filter((e) => e.kind !== 'file').slice(-8).reverse()

  return (
    <Card title="Activity" tight actions={<span className="muted small">files glow while they are being touched</span>}>
      {files.length > 0 && (
        <div className="files">
          {files.map(([path, v]) => {
            const heat = Math.max(0.12, 1 - (now - v.at) / FILE_GLOW_MS)
            const parts = path.split('/')
            return (
              <span key={path} className="file" style={{ '--heat': heat } as React.CSSProperties} title={`${path} · ${v.n} touches`}>
                {parts.length > 1 && <span className="faint">{parts.slice(0, -1).join('/')}/</span>}{parts.at(-1)}
              </span>
            )
          })}
        </div>
      )}
      {feed.length === 0 && files.length === 0 && <div className="empty">Quiet. Activity streams in here as jobs work.</div>}
      {feed.length > 0 && (
        <ul className="feed">
          {feed.map((e) => (
            <li key={e.id} className="feed__row" data-kind={e.kind}>
              <span className="feed__t">{ago(e.at, now)}</span>
              <span className="grow truncate">{e.text}</span>
              {e.machine && <span className="faint small">{e.machine}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- inbox */

function Inbox({ open, all, now, onAnswer }: {
  open: Decision[]; all: Decision[]; now: number; onAnswer: (id: string, choice: string) => Promise<void>
}) {
  const answered = all.filter((d) => d.status === 'answered').sort((a, b) => b.updated - a.updated).slice(0, 5)
  return (
    <div className="col live__inbox" style={{ gap: 'var(--gutter)' }}>
      <div className="row row--between">
        <Eyebrow>Needs you</Eyebrow>
        <span className={`pill ${open.length ? 'pill--warn' : ''}`}>{open.length}</span>
      </div>
      {open.length === 0 && (
        <Card tight><div className="empty">Nothing to decide. Cards land here with the preview playing.</div></Card>
      )}
      {open.map((d) => <DecisionCard key={d.id} d={d} now={now} onAnswer={onAnswer} />)}
      {answered.length > 0 && (
        <Card title="You decided" tight>
          <div className="col" style={{ gap: 'var(--s-2)' }}>
            {answered.map((d) => (
              <div key={d.id} className="row row--between small">
                <span className="truncate">{d.title}</span>
                <span className="row" style={{ gap: 'var(--s-2)', flex: 'none' }}>
                  <span className="pill pill--accent">{d.choice}</span>
                  <span className="muted">{ago(d.updated, now)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function DecisionCard({ d, now, onAnswer }: { d: Decision; now: number; onAnswer: (id: string, c: string) => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null)
  return (
    <section className="card decision">
      {(d.media || d.thumb) && (
        <div className="decision__media">
          {isVideo(d.media)
            ? <video src={d.media} poster={d.thumb} autoPlay muted loop playsInline controls={false} />
            : <img src={d.thumb ?? d.media} alt="" />}
        </div>
      )}
      <div className="decision__body">
        <h3 className="decision__title">{d.title}</h3>
        {d.detail && <p className="muted small">{d.detail}</p>}
        <div className="decision__opts">
          {d.options.map((o, i) => (
            <Btn key={o} size="sm" variant={i === 0 ? 'accent' : 'plain'}
              onClick={() => { setErr(null); onAnswer(d.id, o).catch((e: Error) => setErr(e.message)) }}>
              {o}
            </Btn>
          ))}
        </div>
        {err && <p className="negative small">{err}</p>}
        <p className="faint small">waiting {ago(d.created, now)}</p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- connect */

function Connect({ initial, onSave, onCancel }: {
  initial: LiveConn | null; onSave: (c: LiveConn | null) => void; onCancel?: () => void
}) {
  const [url, setUrl] = useState(initial?.url ?? DEFAULT_RELAY)
  const [token, setToken] = useState(initial?.token ?? '')
  const [state, setState] = useState<'idle' | 'testing' | 'bad'>('idle')

  const test = async () => {
    setState('testing')
    try {
      // A tiny note event both proves the token and shows up in the feed.
      const r = await fetch(`${url.replace(/\/$/, '')}/v1/event`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Live tab connected', kind: 'note', machine: 'dashboard' }),
      })
      if (!r.ok) throw new Error(String(r.status))
      onSave({ url: url.trim(), token: token.trim() })
    } catch {
      setState('bad')
    }
  }

  return (
    <div className="col" style={{ gap: 'var(--s-6)', maxWidth: 560 }}>
      <header className="page-head">
        <Eyebrow>Holding · live</Eyebrow>
        <h1>Connect Live</h1>
        <p className="lede muted">Live listens to the relay on the Hetzner box. Paste its token once; it stays in this browser only.</p>
      </header>
      <Card>
        <form className="col" style={{ gap: 'var(--s-4)' }} onSubmit={(e) => { e.preventDefault(); void test() }}>
          <label><span className="label">Relay address</span>
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
          </label>
          <label><span className="label">Token</span>
            <input className="field" type="password" value={token} onChange={(e) => setToken(e.target.value)}
              autoComplete="off" spellCheck={false} placeholder="from ~/.config/hq-live.json" />
          </label>
          {state === 'bad' && <p className="negative small">Could not reach the relay with that token.</p>}
          <div className="row" style={{ gap: 'var(--s-3)' }}>
            <Btn type="submit" variant="accent" disabled={!token.trim() || state === 'testing'}>
              {state === 'testing' ? 'Checking' : 'Connect'}
            </Btn>
            {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
            {initial && <Btn variant="ghost" onClick={() => onSave(null)}>Forget this device</Btn>}
          </div>
        </form>
      </Card>
    </div>
  )
}
