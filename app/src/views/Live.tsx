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
 * Live: talk once, watch, tap. The layout is not fixed, it follows the work:
 *   - the stage shows ONE job big (whatever needs you first, else the freshest),
 *     drawn by a renderer picked by the job's `view` (clips, a build, leads, a number, a doc);
 *     every other running job shrinks into the dock below it, click one to bring it forward
 *   - the inbox column only exists while something needs a tap
 *   - the 11 on the left glow while an agent works on them; click one to focus everything on it
 * Everything fits one screen; only a crowded panel scrolls inside itself.
 */

const PULSE_MS = 90_000
const FILE_GLOW_MS = 10 * 60_000

const LINK_LABEL: Record<LinkState, string> = {
  off: 'not connected', connecting: 'connecting', live: 'live', offline: 'relay offline',
}

type BizInfo = { id: number; name: string; color: string; file: string }
type BizMap = Map<number, BizInfo>

function useBiz(): BizMap {
  const s = useAppState()
  return useMemo(() => new Map(s.businesses.map((b) => [b.id, {
    id: b.id, name: b.name, color: accentColor(ENGINE_ACCENT[b.engine]), file: b.file,
  }])), [s.businesses])
}

function BizChip({ id, biz }: { id?: number; biz: BizMap }) {
  const b = id != null ? biz.get(id) : undefined
  if (!b) return <span className="bizchip bizchip--none">no business</span>
  return (
    <span className="bizchip" style={{ '--eng': b.color } as React.CSSProperties}>
      <b>{b.id}</b>{b.name}
    </span>
  )
}

const safeSrc = (u?: unknown) => (typeof u === 'string' && /^(https:\/\/|http:\/\/localhost[:/])/.test(u) ? u : undefined)
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/* ================================================================== shell */

export function Live({ onGo }: { onGo: (r: string) => void }) {
  const [conn, setConn] = useState<LiveConn | null>(loadConn)
  const [editing, setEditing] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<'log' | 'history' | null>(null)
  const live = useLive(conn)
  const now = useTick(2000)
  const biz = useBiz()

  const inFocus = (id?: number) => focus === null || id === focus
  const jobs = Object.values(live.jobs).filter((j) => inFocus(j.biz))
  const events = live.events.filter((e) => inFocus(e.biz))
  const decisions = Object.values(live.decisions).filter((d) => inFocus(d.biz))
  const open = decisions.filter((d) => d.status === 'open').sort((a, b) => a.created - b.created)
  const openAll = Object.values(live.decisions).filter((d) => d.status === 'open').length
  const focused = focus !== null ? biz.get(focus) : undefined

  // Who gets the stage: the job behind the oldest open card, else the one you clicked,
  // else the newest job to start. (Not "most recently updated": a ticking chart would hog it.)
  const active = jobs.filter((j) => j.status !== 'done' && j.status !== 'failed')
    .sort((a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting') || b.created - a.created)
  const finished = jobs.filter((j) => !active.includes(j)).sort((a, b) => b.updated - a.updated).slice(0, 4)
  const needsYou = open.map((d) => active.find((j) => j.id === d.job)).find(Boolean)
  const hero = needsYou ?? active.find((j) => j.id === pinned) ?? active[0]
  const dock = active.filter((j) => j !== hero)

  useEffect(() => {
    const base = 'Holding'
    document.title = openAll ? `(${openAll}) ${base}` : base
    return () => { document.title = base }
  }, [openAll])

  if (!conn || editing) {
    return <Connect initial={conn} onSave={(c) => { saveConn(c); setConn(c); setEditing(false) }}
      onCancel={conn ? () => setEditing(false) : undefined} />
  }

  return (
    <div className="lv" data-inbox={open.length > 0}>
      <header className="lv__head">
        <div className="row" style={{ gap: 'var(--s-3)' }}>
          <h1 className="lv__title">Live</h1>
          <span className={`pill live-link live-link--${live.link}`}><span className="dot" />{LINK_LABEL[live.link]}</span>
          <span className="pill">{active.length} running</span>
          <span className={`pill ${open.length ? 'pill--warn' : ''}`}>{open.length ? `${open.length} need you` : 'nothing needs you'}</span>
          {focused && (
            <span className="row" style={{ gap: 'var(--s-2)' }}>
              <BizChip id={focused.id} biz={biz} />
              <button className="link small" onClick={() => onGo(`biz/${focused.file}`)}>page</button>
              <button className="link small" onClick={() => setFocus(null)}>show all</button>
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          <Btn size="sm" variant={drawer === 'log' ? 'accent' : 'ghost'} onClick={() => setDrawer(drawer === 'log' ? null : 'log')}>Activity</Btn>
          <Btn size="sm" variant={drawer === 'history' ? 'accent' : 'ghost'} onClick={() => setDrawer(drawer === 'history' ? null : 'history')}>History</Btn>
          <Btn size="sm" variant="ghost" icon="gear" title="Relay connection" onClick={() => setEditing(true)} />
        </div>
      </header>

      <div className="lv__grid">
        <Eleven events={live.events} jobs={live.jobs} now={now} focus={focus}
          onFocus={(id) => setFocus((f) => (f === id ? null : id))} />

        <main className="lv__stage">
          {hero
            ? <Hero key={hero.id} job={hero} now={now} biz={biz} events={events} />
            : <Idle finished={finished} now={now} biz={biz} />}
          {(dock.length > 0 || (hero && finished.length > 0)) && (
            <div className="dock">
              {dock.map((j) => (
                <button key={j.id} type="button" className="mini" data-status={j.status} onClick={() => setPinned(j.id)}
                  style={{ '--eng': j.biz != null ? biz.get(j.biz)?.color : undefined } as React.CSSProperties}>
                  <span className="mini__top"><span className={`rundot ${j.status === 'waiting' ? 'rundot--wait' : 'rundot--run'}`} /><b>#{j.biz ?? '?'}</b><span className="truncate">{j.title}</span></span>
                  <MiniBody job={j} />
                </button>
              ))}
              {hero && finished.map((j) => (
                <div key={j.id} className="mini mini--done">
                  <span className="mini__top"><span className={`rundot ${j.status === 'failed' ? 'rundot--bad' : 'rundot--ok'}`} /><b>#{j.biz ?? '?'}</b><span className="truncate">{j.title}</span></span>
                  <span className="faint small truncate">{j.note || 'done'} · {ago(j.updated, now)}</span>
                </div>
              ))}
            </div>
          )}
          <Ticker events={events} now={now} biz={biz} />
        </main>

        {open.length > 0 && (
          <aside className="lv__inbox">
            <Eyebrow>Needs you</Eyebrow>
            {open.map((d, i) => (
              <DecisionCard key={d.id} d={d} job={d.job ? live.jobs[d.job] : undefined} now={now} biz={biz}
                compact={i > 0} onAnswer={live.answer} />
            ))}
          </aside>
        )}
      </div>

      {drawer && (
        <div className="drawer" role="dialog" aria-label={drawer === 'log' ? 'Activity log' : 'History'}>
          <div className="row row--between" style={{ marginBottom: 'var(--s-4)' }}>
            <h2 className="card__title">{drawer === 'log' ? 'Activity log' : 'History'}</h2>
            <Btn size="sm" variant="ghost" icon="x" title="Close" onClick={() => setDrawer(null)} />
          </div>
          {drawer === 'log' ? <Feed events={events} now={now} biz={biz} max={80} /> : <HistoryList all={decisions} jobs={finished} now={now} biz={biz} />}
        </div>
      )}
    </div>
  )
}

/* ============================================================= the 11 */

function Eleven({ events, jobs, now, focus, onFocus }: {
  events: LiveEvent[]; jobs: Record<string, LiveJob>; now: number; focus: number | null; onFocus: (id: number) => void
}) {
  const s = useAppState()
  const last = useMemo(() => {
    const m = new Map<number, number>()
    for (const e of events) if (e.biz != null) m.set(e.biz, Math.max(m.get(e.biz) ?? 0, e.at))
    for (const j of Object.values(jobs)) if (j.biz != null) m.set(j.biz, Math.max(m.get(j.biz) ?? 0, j.updated))
    return m
  }, [events, jobs])
  const runningBiz = new Set(Object.values(jobs).filter((j) => j.status === 'running' || j.status === 'waiting').map((j) => j.biz))

  return (
    <nav className="eleven2" aria-label="The 11">
      {s.businesses.map((b) => {
        const at = last.get(b.id)
        const hot = at !== undefined && now - at < PULSE_MS
        return (
          <button key={b.file} type="button" className="e2" data-hot={hot} data-run={runningBiz.has(b.id)}
            aria-pressed={focus === b.id} data-dim={focus !== null && focus !== b.id}
            style={{ '--eng': accentColor(ENGINE_ACCENT[b.engine]) } as React.CSSProperties}
            title={`${b.name}${at ? `, last activity ${ago(at, now)} ago` : ''}. Click to focus.`}
            onClick={() => onFocus(b.id)}>
            <span className="e2__num">{b.id}</span>
            <span className="e2__name truncate">{b.name}</span>
          </button>
        )
      })}
    </nav>
  )
}

/* =============================================================== stage */

function Idle({ finished, now, biz }: { finished: LiveJob[]; now: number; biz: BizMap }) {
  return (
    <section className="card stg stg--idle">
      <div className="idle">
        <div className="idle__ring" />
        <h2>All quiet</h2>
        <p className="muted">When an agent starts working, its job takes over this space.</p>
        {finished.length > 0 && (
          <div className="col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)', width: 'min(520px, 100%)' }}>
            {finished.map((j) => (
              <div key={j.id} className="row row--between small">
                <span className="row truncate" style={{ gap: 'var(--s-2)' }}>
                  <span className={`rundot ${j.status === 'failed' ? 'rundot--bad' : 'rundot--ok'}`} />
                  <BizChip id={j.biz} biz={biz} /><span className="truncate">{j.title}</span>
                </span>
                <span className="muted">{ago(j.updated, now)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Hero({ job, now, biz, events }: { job: LiveJob; now: number; biz: BizMap; events: LiveEvent[] }) {
  const waiting = job.status === 'waiting'
  const b = job.biz != null ? biz.get(job.biz) : undefined
  return (
    <section className="card stg" data-view={job.view ?? 'media'} data-waiting={waiting}
      style={{ '--eng': b?.color ?? 'var(--accent)' } as React.CSSProperties}>
      <header className="stg__head">
        <div className="col" style={{ gap: 6, minWidth: 0 }}>
          <span className="row" style={{ gap: 'var(--s-2)' }}><BizChip id={job.biz} biz={biz} />
            {job.machine && <span className="faint small">on {job.machine}</span>}</span>
          <h2 className="stg__title truncate">{job.title}</h2>
        </div>
        <span className={`pill ${waiting ? 'pill--warn' : 'pill--accent'}`}>
          <span className={`rundot ${waiting ? 'rundot--wait' : 'rundot--run'}`} />{waiting ? 'needs you' : 'running'}
        </span>
      </header>
      {job.stages.length > 0 && <Pipe job={job} />}
      {job.note && <p className="muted small stg__note">{job.note}</p>}
      <div className="stg__body">
        {job.view === 'build' ? <BuildView job={job} events={events} now={now} />
          : job.view === 'leads' ? <LeadsView job={job} />
            : job.view === 'metric' ? <MetricView job={job} />
              : job.view === 'doc' ? <DocView job={job} />
                : <MediaView job={job} />}
      </div>
    </section>
  )
}

function Pipe({ job }: { job: LiveJob }) {
  const waiting = job.status === 'waiting'
  return (
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
  )
}

/* ---------------------------------------------------------- renderers */

function MediaView({ job }: { job: LiveJob }) {
  if (!job.items.length) return <div className="empty">Waiting for the first output.</div>
  return <div className="tiles">{job.items.map((it) => <Tile key={it.id} item={it} />)}</div>
}

function Tile({ item }: { item: LiveItem }) {
  const [hover, setHover] = useState(false)
  const showVideo = hover && isVideo(item.media)
  return (
    <figure className="tile" data-status={item.status} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
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

type FileRow = { path: string; state?: 'new' | 'edit' | 'active' | 'idle' }

/** A build: the file tree lighting up, the tests filling, and a live wireframe of what is being made. */
function BuildView({ job }: { job: LiveJob; events: LiveEvent[]; now: number }) {
  const d = (job.data ?? {}) as Record<string, unknown>
  const files = arr<FileRow>(d.files)
  const tests = (d.tests ?? {}) as Record<string, unknown>
  const total = num(tests.total), passed = num(tests.passed), failed = num(tests.failed)
  const spec = arr<Block>(d.preview)
  return (
    <div className="build">
      <div className="build__files">
        <Eyebrow>Files</Eyebrow>
        <ul className="tree">
          {files.length === 0 && <li className="faint small">no files yet</li>}
          {files.map((f) => {
            const parts = f.path.split('/')
            return (
              <li key={f.path} className="tree__row" data-state={f.state ?? 'idle'} style={{ paddingLeft: `${(parts.length - 1) * 12}px` }}>
                <span className="tree__mark">{f.state === 'new' ? '+' : f.state === 'edit' || f.state === 'active' ? '~' : ''}</span>
                <span className="truncate">{parts.at(-1)}</span>
              </li>
            )
          })}
        </ul>
        {total > 0 && (
          <div className="tests">
            <div className="row row--between small"><span>Checks</span><span className={failed ? 'negative' : 'positive'}>{passed} / {total}{failed ? `, ${failed} failing` : ''}</span></div>
            <div className="tests__bar">
              <i style={{ width: `${(passed / total) * 100}%` }} />
              <i className="tests__bad" style={{ width: `${(failed / total) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="build__preview">
        <Eyebrow>Preview {txt(d.previewLabel) && `· ${txt(d.previewLabel)}`}</Eyebrow>
        {spec.length ? <Wireframe spec={spec} /> : <div className="empty">The preview draws itself once there is something to show.</div>}
      </div>
    </div>
  )
}

/** A wireframe drawn from a tiny spec, so an agent can show a layout without making an image. */
type Block = { t: string; n?: number; hi?: number; label?: string }
function Wireframe({ spec }: { spec: Block[] }) {
  return (
    <div className="wf">
      {spec.slice(0, 14).map((b, i) => {
        const n = Math.min(4, Math.max(1, num(b.n, 1)))
        switch (b.t) {
          case 'nav': return <div key={i} className="wf__nav"><i /><span><i /><i /><i /></span></div>
          case 'hero': return <div key={i} className="wf__hero"><i className="wf__h1" /><i className="wf__line" /><i className="wf__btn" /></div>
          case 'price': return (
            <div key={i} className="wf__row">
              {Array.from({ length: n }, (_, k) => (
                <div key={k} className="wf__price" data-hi={num(b.hi, -1) === k}><i className="wf__h2" /><i className="wf__big" /><i className="wf__line" /><i className="wf__line" /><i className="wf__btn" /></div>
              ))}
            </div>
          )
          case 'cards': return <div key={i} className="wf__row">{Array.from({ length: n }, (_, k) => <div key={k} className="wf__card"><i className="wf__img" /><i className="wf__line" /></div>)}</div>
          case 'toggle': return <div key={i} className="wf__toggle"><i /><i /></div>
          case 'faq': return <div key={i} className="wf__faq">{Array.from({ length: n }, (_, k) => <i key={k} />)}</div>
          case 'cta': return <div key={i} className="wf__cta"><i className="wf__btn" /></div>
          default: return <div key={i} className="wf__text">{Array.from({ length: n }, (_, k) => <i key={k} className="wf__line" />)}</div>
        }
      })}
    </div>
  )
}

type Lead = { name: string; meta?: string; status?: string; score?: number }
function LeadsView({ job }: { job: LiveJob }) {
  const d = (job.data ?? {}) as Record<string, unknown>
  const leads = arr<Lead>(d.leads)
  const count = (s: string) => leads.filter((l) => l.status === s).length
  return (
    <div className="col" style={{ gap: 'var(--s-4)', minHeight: 0 }}>
      <div className="funnel2">
        {[['found', leads.length], ['drafted', count('drafted') + count('sent')], ['sent', count('sent')]].map(([k, v]) => (
          <div key={k} className="funnel2__step"><b>{v}</b><span>{k}</span></div>
        ))}
      </div>
      <div className="leads">
        {leads.map((l) => (
          <div key={l.name} className="lead" data-status={l.status ?? 'found'}>
            <span className="lead__name truncate">{l.name}</span>
            <span className="faint small truncate">{l.meta}</span>
            <span className="row row--between small">
              <span className="pill">{l.status ?? 'found'}</span>
              {l.score != null && <span className="lead__score" style={{ '--s': num(l.score) / 100 } as React.CSSProperties}><i /></span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricView({ job }: { job: LiveJob }) {
  const d = (job.data ?? {}) as Record<string, unknown>
  const series = arr<number>(d.series).filter((v) => typeof v === 'number')
  const stats = arr<{ label: string; value: string }>(d.stats)
  const delta = num(d.delta)
  return (
    <div className="metric">
      <div className="metric__top">
        <div className="col">
          <span className="eyebrow">{txt(d.label)}</span>
          <span className="metric__value">{txt(d.value)}<small>{txt(d.unit)}</small></span>
          {d.delta !== undefined && <span className={delta >= 0 ? 'positive' : 'negative'}>{delta >= 0 ? '+' : ''}{delta}% since start</span>}
        </div>
        <div className="metric__stats">
          {stats.map((s) => <div key={s.label} className="stat"><span className="stat__label">{s.label}</span><span className="stat__value">{s.value}</span></div>)}
        </div>
      </div>
      <Spark series={series} />
    </div>
  )
}

function Spark({ series }: { series: number[] }) {
  if (series.length < 2) return <div className="empty">The chart fills in as numbers arrive.</div>
  const min = Math.min(...series), max = Math.max(...series)
  const span = max - min || 1
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * 1000},${190 - ((v - min) / span) * 170}`)
  const up = series.at(-1)! >= series[0]!
  return (
    <svg className="spark" viewBox="0 0 1000 200" preserveAspectRatio="none" data-up={up}>
      <path className="spark__area" d={`M0,200 L${pts.join(' L')} L1000,200 Z`} />
      <path className="spark__line" d={`M${pts.join(' L')}`} />
    </svg>
  )
}

function DocView({ job }: { job: LiveJob }) {
  const d = (job.data ?? {}) as Record<string, unknown>
  const paras = arr<string>(d.paragraphs)
  return (
    <article className="doc">
      {txt(d.heading) && <h3 className="doc__h">{txt(d.heading)}</h3>}
      {paras.map((p, i) => (
        <p key={i} className={i === paras.length - 1 && d.typing ? 'doc__p doc__p--typing' : 'doc__p'}>{txt(p)}</p>
      ))}
      {arr<string>(d.tags).length > 0 && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{arr<string>(d.tags).map((t) => <span key={t} className="pill">{t}</span>)}</div>}
    </article>
  )
}

/** One-line glimpse of a docked job, in its own language. */
function MiniBody({ job }: { job: LiveJob }) {
  const d = (job.data ?? {}) as Record<string, unknown>
  if (job.view === 'metric') return <span className="mini__metric">{txt(d.value)}{txt(d.unit)} <Spark series={arr<number>(d.series).slice(-30)} /></span>
  if (job.view === 'media') {
    const done = job.items.filter((i) => i.status === 'done').length
    return <span className="mini__thumbs">{job.items.slice(0, 6).map((i) => <i key={i.id} data-status={i.status} style={{ backgroundImage: i.thumb ? `url(${i.thumb})` : undefined }} />)}<span className="faint small">{done}/{job.items.length}</span></span>
  }
  const stage = job.stages[Math.min(job.stage, job.stages.length - 1)]
  return (
    <span className="mini__bar">
      <i style={{ width: `${job.stages.length ? (Math.min(job.stage, job.stages.length) / job.stages.length) * 100 : 0}%` }} />
      <span className="faint small">{stage ?? job.note ?? ''}</span>
    </span>
  )
}

/* ------------------------------------------------------------- activity */

function Ticker({ events, now, biz }: { events: LiveEvent[]; now: number; biz: BizMap }) {
  const last = events.filter((e) => e.kind !== 'file').slice(-3).reverse()
  if (!last.length) return null
  return (
    <div className="ticker">
      {last.map((e) => (
        <span key={e.id} className="ticker__item">
          <span className="faint">{ago(e.at, now)}</span>
          {e.biz != null && biz.has(e.biz) && <b style={{ color: biz.get(e.biz)!.color }}>#{e.biz}</b>}
          <span className="truncate">{e.text}</span>
        </span>
      ))}
    </div>
  )
}

function Feed({ events, now, biz, max }: { events: LiveEvent[]; now: number; biz: BizMap; max: number }) {
  const files = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) if (e.kind === 'file' && e.path) m.set(e.path, Math.max(m.get(e.path) ?? 0, e.at))
    return [...m.entries()].filter(([, at]) => now - at < FILE_GLOW_MS).sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [events, now])
  const feed = events.filter((e) => e.kind !== 'file').slice(-max).reverse()
  return (
    <div className="col" style={{ gap: 'var(--s-4)' }}>
      {files.length > 0 && (
        <div className="files">
          {files.map(([path, at]) => (
            <span key={path} className="file" style={{ '--heat': Math.max(0.12, 1 - (now - at) / FILE_GLOW_MS) } as React.CSSProperties}>{path}</span>
          ))}
        </div>
      )}
      <ul className="feed">
        {feed.length === 0 && <li className="empty">Quiet.</li>}
        {feed.map((e) => (
          <li key={e.id} className="feed__row" data-kind={e.kind}>
            <span className="feed__t">{ago(e.at, now)}</span>
            {e.biz != null && biz.has(e.biz) && <span className="feed__biz" style={{ color: biz.get(e.biz)!.color }}>#{e.biz}</span>}
            <span className="grow truncate">{e.text}</span>
            {e.machine && <span className="faint small">{e.machine}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function HistoryList({ all, jobs, now, biz }: { all: Decision[]; jobs: LiveJob[]; now: number; biz: BizMap }) {
  const closed = all.filter((d) => d.status !== 'open').sort((a, b) => b.updated - a.updated).slice(0, 30)
  return (
    <div className="col" style={{ gap: 'var(--s-4)' }}>
      {closed.length === 0 && jobs.length === 0 && <div className="empty">Nothing yet.</div>}
      {closed.map((d) => (
        <div key={d.id} className="col" style={{ gap: 4 }}>
          <div className="row row--between small"><span className="truncate">{d.title}</span><span className="muted">{ago(d.updated, now)}</span></div>
          <div className="row small" style={{ gap: 'var(--s-2)' }}>
            <BizChip id={d.biz} biz={biz} />
            {d.status === 'expired'
              ? <span className="pill pill--warn">timed out{d.choice ? `, used ${d.choice}` : ''}</span>
              : <span className="pill pill--accent">you: {d.choice}</span>}
          </div>
        </div>
      ))}
      {jobs.length > 0 && <Eyebrow>Finished jobs</Eyebrow>}
      {jobs.map((j) => (
        <div key={j.id} className="row row--between small">
          <span className="row truncate" style={{ gap: 'var(--s-2)' }}><BizChip id={j.biz} biz={biz} /><span className="truncate">{j.title}</span></span>
          <span className="muted">{j.note ? `${j.note} · ` : ''}{ago(j.updated, now)}</span>
        </div>
      ))}
    </div>
  )
}

/* ============================================================ decisions */

type Variant = { label?: string; spec?: Block[]; image?: string; note?: string }

function DecisionCard({ d, job, now, biz, compact, onAnswer }: {
  d: Decision; job?: LiveJob; now: number; biz: BizMap; compact: boolean; onAnswer: (id: string, c: string) => Promise<void>
}) {
  const [err, setErr] = useState<string | null>(null)
  const [openUp, setOpenUp] = useState(false)
  const left = d.expires ? d.expires - now : null
  const pick = (o: string) => { setErr(null); onAnswer(d.id, o).catch((e: Error) => setErr(e.message)) }
  const variants = arr<Variant>((d as Decision & { variants?: unknown }).variants)
  const kind = (d as Decision & { kind?: string }).kind ?? 'choice'
  const text = (d as Decision & { text?: string }).text

  if (compact && !openUp) {
    return (
      <button type="button" className="card decision decision--compact" onClick={() => setOpenUp(true)}>
        <BizChip id={d.biz} biz={biz} /><span className="truncate">{d.title}</span><span className="faint small">open</span>
      </button>
    )
  }

  return (
    <section className="card decision" data-kind={kind}>
      {kind === 'choice' && (d.media || d.thumb) && (
        <div className="decision__media">
          {isVideo(d.media)
            ? <video src={d.media} poster={d.thumb} autoPlay muted loop playsInline />
            : <img src={d.thumb ?? d.media} alt="" />}
        </div>
      )}
      <div className="decision__body">
        <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <BizChip id={d.biz} biz={biz} />
          {job && <span className="faint small truncate">{job.title}</span>}
        </div>
        <h3 className="decision__title">{d.title}</h3>
        {d.detail && <p className="muted small">{d.detail}</p>}

        {kind === 'ab' && variants.length > 0 && (
          <div className="ab">
            {variants.map((v) => (
              <button key={txt(v.label)} type="button" className="ab__opt" onClick={() => v.label && d.options.includes(v.label) && pick(v.label)}>
                {safeSrc(v.image) ? <img src={safeSrc(v.image)} alt="" /> : <Wireframe spec={arr<Block>(v.spec)} />}
                <span className="ab__label">{txt(v.label)}</span>
                {v.note && <span className="faint small">{txt(v.note)}</span>}
              </button>
            ))}
          </div>
        )}
        {kind === 'text' && text && <blockquote className="draft">{text}</blockquote>}

        <div className="decision__opts">
          {d.options.map((o, i) => <Btn key={o} size="sm" variant={i === 0 ? 'accent' : 'plain'} onClick={() => pick(o)}>{o}</Btn>)}
        </div>
        {err && <p className="negative small">{err}</p>}
        <p className="faint small">
          waiting {ago(d.created, now)}
          {left !== null && left > 0 && ` · if no tap in ${ago(now - left, now)}, it uses ${d.fallback ?? 'nothing'}`}
        </p>
      </div>
    </section>
  )
}

/* ============================================================= connect */

function Connect({ initial, onSave, onCancel }: {
  initial: LiveConn | null; onSave: (c: LiveConn | null) => void; onCancel?: () => void
}) {
  const [url, setUrl] = useState(initial?.url ?? DEFAULT_RELAY)
  const [token, setToken] = useState(initial?.token ?? '')
  const [state, setState] = useState<'idle' | 'testing' | 'bad'>('idle')

  const test = async () => {
    setState('testing')
    try {
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
