import { useState } from 'react'
import type { Account, AccountKind, AccountStatus, Business } from '@shared/schema.ts'
import { ACCOUNT_KINDS } from '@shared/schema.ts'
import { Btn, Card, Eyebrow, Stat } from '../components/ui.tsx'
import { removeAccount, saveAccount } from '../lib/api.ts'
import { useAppState, useStore } from '../lib/store.tsx'

/**
 * The 11: every email, domain, handle and store per business, from accounts.md.
 * One grid for layers 1 to 3 (what gets built first), one for layer 4 (details before ads).
 * Click any cell to fill it in. Never passwords: those live in the vault.
 */

const STATUS_LABEL: Record<AccountStatus, string> = { planned: 'to make', created: 'created', live: 'live' }
const kindOf = (id: AccountKind) => ACCOUNT_KINDS.find((k) => k.id === id)!
const BUILD_KINDS = ACCOUNT_KINDS.filter((k) => k.layer < 4)
const DETAIL_KINDS = ACCOUNT_KINDS.filter((k) => k.layer === 4)

type Slot = { business: Business; kind: AccountKind; account: Account | undefined }

function Editor({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const { run } = useStore()
  const kind = kindOf(slot.kind)
  const [a, setA] = useState<Account>(slot.account ?? {
    business: String(slot.business.id), kind: slot.kind, value: '', status: 'planned', phone: '', note: '',
  })
  const set = <K extends keyof Account>(k: K, v: Account[K]) => setA({ ...a, [k]: v })
  const save = () => { void run(() => saveAccount(a)).then(onClose) }

  return (
    <Card title={`#${slot.business.id} ${slot.business.name} · ${kind.label}`}
      actions={<Btn icon="x" size="sm" title="Close" onClick={onClose} />}>
      <form className="pay-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="pay-form__wide">{kind.label}
          <input id="acct-value" className="field field--sm" value={a.value} placeholder={kind.hint} autoFocus
            onChange={(e) => set('value', e.target.value)} /></label>
        <label>Status<select id="acct-status" className="field field--sm" value={a.status}
          onChange={(e) => set('status', e.target.value as AccountStatus)}>
          <option value="planned">To make</option><option value="created">Created</option><option value="live">Live</option></select></label>
        <label>Verified with<select id="acct-phone" className="field field--sm" value={a.phone}
          onChange={(e) => set('phone', e.target.value as Account['phone'])}>
          <option value="">No phone</option><option value="main">Main SIM</option><option value="second">Second SIM</option></select></label>
        <label className="pay-form__wide" style={{ gridColumn: '1 / -1' }}>Note
          <input id="acct-note" className="field field--sm" value={a.note} onChange={(e) => set('note', e.target.value)} /></label>
      </form>
      <div className="row" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
        <Btn variant="accent" icon="check" onClick={save}>Save</Btn>
        {slot.account && <Btn variant="ghost" icon="trash"
          onClick={() => { void run(() => removeAccount(a.business, a.kind)).then(onClose) }}>Not needed</Btn>}
      </div>
      <p className="muted small" style={{ marginTop: 'var(--s-3)' }}>Names and handles only. Passwords and keys go in the vault.</p>
    </Card>
  )
}

function Cell({ account, onOpen }: { account: Account | undefined; onOpen: () => void }) {
  if (!account) {
    return <button type="button" className="acct-cell acct-cell--empty" onClick={onOpen} aria-label="Add">+</button>
  }
  return (
    <button type="button" className="acct-cell" data-status={account.status} onClick={onOpen}
      title={[account.value || STATUS_LABEL[account.status], account.note].filter(Boolean).join(' · ')}>
      <span className="acct-dot" data-status={account.status} />
      <span className="truncate">{account.value || STATUS_LABEL[account.status]}</span>
      {account.phone === 'second' && <span className="acct-sim" title="Verified with the second SIM">2</span>}
    </button>
  )
}

function Grid({ kinds, onOpen }: { kinds: readonly (typeof ACCOUNT_KINDS)[number][]; onOpen: (s: Slot) => void }) {
  const s = useAppState()
  return (
    <div className="table__scroll">
      <table className="table acct">
        <thead><tr><th>Business</th>{kinds.map((k) => <th key={k.id}>{k.label}</th>)}</tr></thead>
        <tbody>
          {s.businesses.map((b) => {
            const mine = b.accounts.filter((a) => kinds.some((k) => k.id === a.kind))
            const ready = mine.filter((a) => a.status !== 'planned').length
            return (
              <tr key={b.id}>
                <th scope="row">
                  <a className="acct-biz" href={`#biz/${b.file}`}>
                    <span className="acct-biz__n">{String(b.id).padStart(2, '0')}</span>
                    <span className="truncate">{b.name}</span>
                  </a>
                  {mine.length > 0 && <span className="acct-meter" title={`${ready} of ${mine.length} exist`}>
                    {mine.map((a) => <i key={a.kind} data-on={a.status !== 'planned'} />)}
                  </span>}
                </th>
                {kinds.map((k) => {
                  const account = mine.find((a) => a.kind === k.id)
                  return <td key={k.id}><Cell account={account} onOpen={() => onOpen({ business: b, kind: k.id, account })} /></td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Accounts() {
  const s = useAppState()
  const [slot, setSlot] = useState<Slot | null>(null)
  const count = (st: AccountStatus) => s.accounts.filter((a) => a.status === st).length
  const emailsToMake = s.accounts.filter((a) => a.kind === 'email' && a.status === 'planned').length
  const open = (next: Slot) => { setSlot(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="col" style={{ gap: 'var(--s-6)' }}>
      <header className="page-head"><Eyebrow>Every account, per business</Eyebrow><h1>The 11</h1></header>

      {slot && <Editor key={`${slot.business.id}-${slot.kind}`} slot={slot} onClose={() => setSlot(null)} />}

      <div className="grid grid--4">
        <Stat label="To make" value={count('planned')} sub={`${emailsToMake} of them emails`} large />
        <Stat label="Created" value={count('created')} sub="exist, not in use yet" large />
        <Stat label="Live" value={count('live')} sub="in use" large />
        <Stat label="On second SIM" value={s.accounts.filter((a) => a.phone === 'second').length} sub="verified with the new number" large />
      </div>

      <Card title="Build first: identity, channels, store">
        <Grid kinds={BUILD_KINDS} onOpen={open} />
        <div className="acct-legend muted small">
          <span><i className="acct-dot" data-status="planned" /> to make</span>
          <span><i className="acct-dot" data-status="created" /> created</span>
          <span><i className="acct-dot" data-status="live" /> live</span>
          <span><i className="acct-sim">2</i> second SIM</span>
          <span>+ add one a business needs</span>
        </div>
      </Card>

      <Card title="Details: before ads and money">
        <Grid kinds={DETAIL_KINDS} onOpen={open} />
      </Card>

      <p className="muted small">Saved in accounts.md in the private holding repo. Names and handles only, never passwords.</p>
    </div>
  )
}
