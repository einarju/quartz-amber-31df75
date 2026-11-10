#!/usr/bin/env node
/**
 * HQ Live relay: the always-on meeting point between running jobs and the Live tab.
 *
 * Jobs (PC, Mac, Hetzner, Claude Code hooks) POST what is happening. The Live tab
 * listens on one Server-Sent Events stream. When a job needs Einar, it opens a
 * decision and long-polls for the answer; the tap in the tab closes it.
 *
 * No AI, no dependencies, no database: state is a small JSON file. Runs on loopback
 * behind Caddy. Every call except /v1/health needs the shared token.
 *
 *   POST /v1/job                 upsert a job (pipeline + items), merged by id
 *   POST /v1/event               one activity line (tool call, file touched, note)
 *   POST /v1/decision            open a decision card -> { id }
 *   GET  /v1/decision/:id/wait   long-poll (<= 25 s) -> { status, choice }
 *   POST /v1/decision/:id/answer { choice } from the tab
 *   GET  /v1/stream?token=       SSE: "snapshot" then live "job" | "event" | "decision"
 *   GET  /v1/health              liveness, no auth
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const PORT = Number(arg('port', process.env.PORT ?? 8095))
const HOST = arg('host', '127.0.0.1')
const DATA_DIR = arg('data', process.env.HQ_DATA_DIR ?? './data')
const TOKEN = (process.env.HQ_RELAY_TOKEN ?? readTokenFile(arg('token-file', '/etc/hq-relay/token'))).trim()
const ORIGINS = new Set((process.env.HQ_ORIGINS ?? 'https://einarju.github.io,http://localhost:4325').split(','))

const MAX_BODY = 64 * 1024
const MAX_EVENTS = 300
const MAX_JOBS = 40
const MAX_DECISIONS = 60
const DAY = 24 * 3600 * 1000

function readTokenFile(path) {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}
if (TOKEN.length < 24) {
  console.error('HQ relay: no token (set HQ_RELAY_TOKEN or --token-file, 24+ chars). Refusing to start.')
  process.exit(1)
}

/* ------------------------------------------------------------------ state */

mkdirSync(DATA_DIR, { recursive: true })
const STATE_FILE = join(DATA_DIR, 'state.json')
let state = { jobs: {}, events: [], decisions: {} }
try { state = { ...state, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) } } catch { /* first run */ }

let saveTimer = null
function save() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    prune()
    const tmp = `${STATE_FILE}.tmp`
    writeFileSync(tmp, JSON.stringify(state))
    renameSync(tmp, STATE_FILE)
  }, 800)
}

function prune() {
  const now = Date.now()
  state.events = state.events.slice(-MAX_EVENTS)
  const jobs = Object.values(state.jobs)
    .filter((j) => j.status === 'running' || j.status === 'waiting' || now - j.updated < DAY)
    .sort((a, b) => b.updated - a.updated).slice(0, MAX_JOBS)
  state.jobs = Object.fromEntries(jobs.map((j) => [j.id, j]))
  const decisions = Object.values(state.decisions)
    .filter((d) => d.status === 'open' || now - d.updated < DAY)
    .sort((a, b) => b.updated - a.updated).slice(0, MAX_DECISIONS)
  state.decisions = Object.fromEntries(decisions.map((d) => [d.id, d]))
}

/* ------------------------------------------------------------ sanitising */

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : v == null ? undefined : String(v).slice(0, max))
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : undefined)
/** Media is only ever shown as <img>/<video> src, and only https (or a local dev server). */
const url = (v) => {
  const s = str(v, 1000)
  return s && /^(https:\/\/|http:\/\/localhost[:/])/.test(s) ? s : undefined
}
const STATUSES = new Set(['queued', 'running', 'waiting', 'done', 'failed'])
const status = (v, fallback) => (STATUSES.has(v) ? v : fallback)

function cleanItem(it) {
  return {
    id: str(it.id, 60) ?? randomUUID().slice(0, 8),
    label: str(it.label, 80),
    status: status(it.status, 'queued'),
    media: url(it.media),
    thumb: url(it.thumb),
    note: str(it.note, 160),
  }
}

/* ------------------------------------------------------------------- sse */

const clients = new Set()
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(msg)
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n') }, 20000).unref()

const waiters = new Map() // decision id -> Set of pending long-poll resolvers
function wake(id) {
  const set = waiters.get(id)
  if (!set) return
  waiters.delete(id)
  for (const fn of set) fn()
}

/* -------------------------------------------------------------- handlers */

function upsertJob(body) {
  const id = str(body.id, 80)
  if (!id) throw new HttpError(400, 'job needs an id')
  const prev = state.jobs[id] ?? { id, items: [], created: Date.now() }
  const job = {
    ...prev,
    biz: int(body.biz) ?? prev.biz,
    title: str(body.title, 120) ?? prev.title ?? id,
    machine: str(body.machine, 40) ?? prev.machine,
    stages: Array.isArray(body.stages) ? body.stages.slice(0, 12).map((s) => str(s, 40)) : prev.stages ?? [],
    stage: int(body.stage) ?? prev.stage ?? 0,
    status: status(body.status, prev.status ?? 'running'),
    note: body.note === undefined ? prev.note : str(body.note, 200),
    updated: Date.now(),
  }
  if (Array.isArray(body.items)) {
    const byId = new Map(prev.items.map((i) => [i.id, i]))
    for (const raw of body.items.slice(0, 40)) {
      const it = cleanItem(raw)
      const old = byId.get(it.id) ?? {}
      byId.set(it.id, Object.fromEntries(Object.entries({ ...old, ...it }).filter(([, v]) => v !== undefined)))
    }
    job.items = [...byId.values()].slice(0, 40)
  }
  state.jobs[id] = job
  broadcast('job', job)
  save()
  return job
}

function addEvent(body) {
  const ev = {
    id: randomUUID().slice(0, 12),
    at: Date.now(),
    biz: int(body.biz),
    job: str(body.job, 80),
    machine: str(body.machine, 40),
    kind: ['tool', 'file', 'note', 'error'].includes(body.kind) ? body.kind : 'note',
    text: str(body.text, 240) ?? '',
    path: str(body.path, 300),
  }
  state.events.push(ev)
  broadcast('event', ev)
  save()
  return ev
}

function openDecision(body) {
  const options = Array.isArray(body.options) ? body.options.slice(0, 4).map((o) => str(o, 24)).filter(Boolean) : []
  if (!str(body.title) || options.length < 2) throw new HttpError(400, 'decision needs a title and 2-4 options')
  const id = str(body.id, 80) ?? randomUUID().slice(0, 12)
  const d = {
    id,
    biz: int(body.biz),
    job: str(body.job, 80),
    title: str(body.title, 120),
    detail: str(body.detail, 400),
    media: url(body.media),
    thumb: url(body.thumb),
    options,
    status: 'open',
    choice: null,
    created: Date.now(),
    updated: Date.now(),
  }
  state.decisions[id] = d
  broadcast('decision', d)
  save()
  return d
}

function answer(id, body) {
  const d = state.decisions[id]
  if (!d) throw new HttpError(404, 'no such decision')
  if (d.status !== 'open') return d
  const choice = str(body.choice, 24)
  if (!d.options.includes(choice)) throw new HttpError(400, 'not one of the options')
  Object.assign(d, { status: 'answered', choice, updated: Date.now() })
  broadcast('decision', d)
  wake(id)
  save()
  return d
}

function waitFor(id, ms) {
  return new Promise((resolve) => {
    const d = state.decisions[id]
    if (!d || d.status !== 'open') return resolve()
    const set = waiters.get(id) ?? new Set()
    waiters.set(id, set)
    const done = () => { clearTimeout(timer); set.delete(done); resolve() }
    const timer = setTimeout(done, ms)
    set.add(done)
  })
}

/* ------------------------------------------------------------------ http */

class HttpError extends Error {
  constructor(code, msg) { super(msg); this.code = code }
}

function authorised(req, u) {
  const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || u.searchParams.get('token') || ''
  const a = Buffer.from(given)
  const b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) { reject(new HttpError(413, 'body too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) } catch { reject(new HttpError(400, 'bad json')) }
    })
    req.on('error', reject)
  })
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', 'http://relay')
  const origin = req.headers.origin
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'origin')
    res.setHeader('access-control-allow-headers', 'authorization, content-type')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  try {
    if (u.pathname === '/v1/health') return send(res, 200, { ok: true, clients: clients.size })
    if (!authorised(req, u)) throw new HttpError(401, 'bad token')

    if (req.method === 'GET' && u.pathname === '/v1/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      res.write('retry: 3000\n\n')
      prune()
      res.write(`event: snapshot\ndata: ${JSON.stringify({ ...state, now: Date.now() })}\n\n`)
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    if (req.method === 'POST' && u.pathname === '/v1/job') return send(res, 200, upsertJob(await readJson(req)))
    if (req.method === 'POST' && u.pathname === '/v1/event') return send(res, 200, addEvent(await readJson(req)))
    if (req.method === 'POST' && u.pathname === '/v1/decision') return send(res, 200, openDecision(await readJson(req)))

    const m = u.pathname.match(/^\/v1\/decision\/([\w.-]{1,80})\/(wait|answer)$/)
    if (m && req.method === 'GET' && m[2] === 'wait') {
      const ms = Math.min(25000, Math.max(0, Number(u.searchParams.get('timeout') ?? 25) * 1000))
      await waitFor(m[1], ms)
      const d = state.decisions[m[1]]
      if (!d) throw new HttpError(404, 'no such decision')
      return send(res, 200, { status: d.status, choice: d.choice })
    }
    if (m && req.method === 'POST' && m[2] === 'answer') return send(res, 200, answer(m[1], await readJson(req)))

    throw new HttpError(404, 'not found')
  } catch (err) {
    send(res, err.code ?? 500, { error: err.message })
  }
})

server.requestTimeout = 0 // SSE streams and long polls stay open
server.listen(PORT, HOST, () => console.log(`HQ relay on ${HOST}:${PORT}, data in ${DATA_DIR}`))
