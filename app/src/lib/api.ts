import type { Account, AppState, MoneyField, Payment } from '@shared/schema.ts'
import * as core from '@shared/core.ts'
import { readAll, write } from './github.ts'
import type { RemoteFile } from './github.ts'
import { today } from './dates.ts'

/**
 * The only place the app touches data. Every function returns the fresh AppState.
 * Files are cached with their GitHub sha; a save that loses a race reloads everything.
 */

type Cache = { root: Map<string, RemoteFile>; businesses: RemoteFile[] }
let cache: Cache | null = null

const name = (path: string) => path.split('/').pop()!

function state(): AppState {
  const c = cache!
  return core.buildState({
    businesses: c.businesses.map((f) => ({ file: name(f.path), text: f.text })),
    foundation: c.root.get('foundation.md')!.text,
    todos: c.root.get('todos.md')!.text,
    payments: c.root.get('payments.md')!.text,
    accounts: c.root.get('accounts.md')!.text,
  })
}

export async function getState(): Promise<AppState> {
  cache = await readAll()
  return state()
}

async function edit(path: string, change: (text: string) => string, message: string): Promise<AppState> {
  if (!cache) await getState()
  const file = path.startsWith('businesses/')
    ? cache!.businesses.find((f) => f.path === path)
    : cache!.root.get(path)
  if (!file) throw new Error(`${path} not found`)
  const next = change(file.text)
  if (next === file.text) return state()
  try {
    file.sha = await write(file, next, `dashboard: ${message}`)
    file.text = next
  } catch (err) {
    cache = await readAll().catch(() => cache)
    throw err
  }
  return state()
}

const biz = (file: string) => `businesses/${file}`

export const toggleBusiness = (file: string, line: number) =>
  edit(biz(file), (t) => core.toggleLine(t, line, file), `tick ${file}:${line + 1}`)

export const setBusinessField = (file: string, key: MoneyField, value: number | null) =>
  edit(biz(file), (t) => core.setField(t, key, value), `${file} ${key} = ${value ?? 'empty'}`)

export const toggleFoundation = (line: number) =>
  edit('foundation.md', (t) => core.toggleLine(t, line, 'foundation.md'), `tick foundation.md:${line + 1}`)

export const addTodo = (text: string, due: string | null, business: number | null) =>
  edit('todos.md', (t) => core.addTodo(t, text, due, business), 'add to-do')

export const toggleTodo = (line: number) =>
  edit('todos.md', (t) => core.toggleLine(t, line, 'todos.md'), `tick to-do ${line + 1}`)

export const deleteTodo = (line: number) =>
  edit('todos.md', (t) => core.deleteTodo(t, line), `delete to-do ${line + 1}`)

const payments = (change: (f: ReturnType<typeof core.parsePayments>) => ReturnType<typeof core.parsePayments>, message: string) =>
  edit('payments.md', (t) => core.writePayments(t, change(core.parsePayments(t))), message)

export const savePayment = (p: Partial<Payment>) => payments((f) => core.upsertPayment(f, p), `payment ${p.name ?? p.id}`)
export const payPayment = (id: string) => payments((f) => core.markPaid(f, id, today()), `paid ${id}`)
export const removePayment = (id: string) => payments((f) => core.deletePayment(f, id), `delete payment ${id}`)

const accounts = (change: (list: Account[]) => Account[], message: string) =>
  edit('accounts.md', (t) => core.writeAccounts(t, change(core.parseAccounts(t))), message)

export const saveAccount = (a: Account) =>
  accounts((list) => core.upsertAccount(list, a), `account #${a.business} ${a.kind}${a.value ? ` ${a.value}` : ''} (${a.status})`)
export const removeAccount = (business: string, kind: string) =>
  accounts((list) => core.deleteAccount(list, business, kind), `remove account #${business} ${kind}`)
