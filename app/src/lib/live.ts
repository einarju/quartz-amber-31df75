import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * HQ Live: one Server-Sent Events stream from the relay on the Hetzner box.
 * The relay is a plain message pipe (no AI); see relay/server.mjs.
 * The token lives only in this browser (localStorage), like the GitHub one.
 */

export type ItemStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed'

export type LiveItem = { id: string; label?: string; status: ItemStatus; media?: string; thumb?: string; note?: string }

export type LiveJob = {
  id: string
  biz?: number
  title: string
  machine?: string
  stages: string[]
  stage: number
  status: ItemStatus
  note?: string
  items: LiveItem[]
  created: number
  updated: number
}

export type LiveEvent = {
  id: string
  at: number
  biz?: number
  job?: string
  machine?: string
  kind: 'tool' | 'file' | 'note' | 'error'
  text: string
  path?: string
}

export type Decision = {
  id: string
  biz?: number
  job?: string
  title: string
  detail?: string
  media?: string
  thumb?: string
  options: string[]
  fallback?: string | null
  expires?: number
  status: 'open' | 'answered' | 'expired'
  choice: string | null
  created: number
  updated: number
}

export type LiveConn = { url: string; token: string }
export type LinkState = 'off' | 'connecting' | 'live' | 'offline'

const KEY = 'hq-live-relay'
export const DEFAULT_RELAY = 'https://hq.167-233-29-228.sslip.io'

export function loadConn(): LiveConn | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LiveConn | null
    if (c?.url && c.token) return c
  } catch { /* fall through */ }
  // Local dev only: app/.env.local (gitignored) can pre-fill the token. Never in a Pages build.
  const dev = import.meta.env.DEV ? (import.meta.env.VITE_HQ_RELAY_TOKEN as string | undefined) : undefined
  return dev ? { url: DEFAULT_RELAY, token: dev } : null
}

export function saveConn(c: LiveConn | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c))
    else localStorage.removeItem(KEY)
  } catch { /* private window: works for this visit only */ }
}

export function useLive(conn: LiveConn | null) {
  const [jobs, setJobs] = useState<Record<string, LiveJob>>({})
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [link, setLink] = useState<LinkState>(conn ? 'connecting' : 'off')
  // The relay's clock vs ours, so "2 min ago" is right even if the PC clock drifts.
  const skew = useRef(0)

  useEffect(() => {
    if (!conn) { setLink('off'); return }
    setLink('connecting')
    const es = new EventSource(`${conn.url.replace(/\/$/, '')}/v1/stream?token=${encodeURIComponent(conn.token)}`)
    const on = <T,>(type: string, fn: (d: T) => void) =>
      es.addEventListener(type, (e) => fn(JSON.parse((e as MessageEvent).data) as T))

    on<{ jobs: Record<string, LiveJob>; events: LiveEvent[]; decisions: Record<string, Decision>; now: number }>('snapshot', (s) => {
      skew.current = Date.now() - s.now
      setJobs(s.jobs)
      setEvents(s.events)
      setDecisions(s.decisions)
      setLink('live')
    })
    on<LiveJob>('job', (j) => setJobs((p) => ({ ...p, [j.id]: j })))
    on<LiveEvent>('event', (ev) => setEvents((p) => [...p.slice(-299), ev]))
    on<Decision>('decision', (d) => setDecisions((p) => ({ ...p, [d.id]: d })))
    es.onerror = () => setLink(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting')
    return () => es.close()
  }, [conn])

  const answer = useCallback(async (id: string, choice: string) => {
    if (!conn) return
    // Optimistic: the card leaves at once; the relay's echo confirms it.
    setDecisions((p) => (p[id] ? { ...p, [id]: { ...p[id], status: 'answered', choice, updated: Date.now() } } : p))
    const r = await fetch(`${conn.url.replace(/\/$/, '')}/v1/decision/${encodeURIComponent(id)}/answer`, {
      method: 'POST',
      headers: { authorization: `Bearer ${conn.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ choice }),
    })
    if (!r.ok) {
      setDecisions((p) => (p[id] ? { ...p, [id]: { ...p[id], status: 'open', choice: null } } : p))
      throw new Error(`The relay said ${r.status}`)
    }
  }, [conn])

  return { jobs, events, decisions, link, answer, skew: skew.current }
}

/** Re-render every few seconds so "ago" labels and glow decay keep moving. */
export function useTick(ms = 3000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'now'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export const isVideo = (u?: string) => !!u && /\.(mp4|webm|mov)(\?|$)/i.test(u)
