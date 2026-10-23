import { useEffect, useState } from 'react'
import { useStore } from './lib/store.tsx'
import { Icon } from './components/Icon.tsx'
import type { IconName } from './components/Icon.tsx'
import { Board } from './views/Board.tsx'
import { BusinessView } from './views/Business.tsx'
import { Todos } from './views/Todos.tsx'
import { Payments } from './views/Payments.tsx'
import { Accounts } from './views/Accounts.tsx'
import { FoundationView } from './views/Foundation.tsx'
import { Login } from './views/Login.tsx'

/**
 * Shell: the neumorphic rail from the other centres, one view on the right (a bottom bar on a phone).
 * Hash routes, no router: #board, #todos, #payments, #accounts, #foundation, #biz/<file>.
 * Signed out, the only thing rendered is the sign-in card.
 */

const VIEWS = [
  { id: 'board', label: 'Board', icon: 'grid' },
  { id: 'todos', label: 'To-dos', icon: 'list' },
  { id: 'payments', label: 'Payments', icon: 'card' },
  { id: 'accounts', label: 'The 11', icon: 'id' },
  { id: 'foundation', label: 'Foundation', icon: 'layers' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[]

function readHash(): string {
  return window.location.hash.replace('#', '') || 'board'
}

export default function App() {
  const { state, error, busy, reload, signedIn, signOut } = useStore()
  const [route, setRoute] = useState(readHash)
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])

  const go = (next: string) => { window.location.hash = next }

  if (!signedIn) return <Login />
  const section = route.startsWith('biz/') ? 'board' : route

  return (
    <div className="app">
      <nav className="rail" aria-label="Sections">
        <div className="rail__mark" title="Holding">11</div>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className="rail__btn"
            aria-current={v.id === section ? 'page' : undefined} onClick={() => go(v.id)}>
            <Icon name={v.icon} />
            <span className="rail__tip">{v.label}</span>
          </button>
        ))}
        <div className="col rail__foot">
          <button type="button" className="rail__btn" onClick={() => setDark(!dark)}>
            <Icon name="bulb" />
            <span className="rail__tip">{dark ? 'Light theme' : 'Dark theme'}</span>
          </button>
          <button type="button" className="rail__btn" onClick={() => { void reload() }}>
            <Icon name="refresh" />
            <span className="rail__tip">Reload from GitHub</span>
          </button>
          <button type="button" className="rail__btn" onClick={signOut}>
            <Icon name="external" />
            <span className="rail__tip">Sign out on this device</span>
          </button>
        </div>
      </nav>

      <main className="main">
        <div className="main__inner">
          {error && (
            <div className="banner banner--error">
              <Icon name="x" size={16} />
              <span className="grow">{error}</span>
              <button className="link" onClick={() => { void reload() }}>retry</button>
            </div>
          )}
          {!state && !error && (
            <div className="row" style={{ justifyContent: 'center', padding: 'var(--s-8)' }}><div className="spin" /></div>
          )}
          {state && (
            <>
              {route.startsWith('biz/') && <BusinessView file={route.slice(4)} onGo={go} />}
              {section === 'board' && !route.startsWith('biz/') && <Board onGo={go} />}
              {section === 'todos' && <Todos onGo={go} />}
              {section === 'payments' && <Payments />}
              {section === 'accounts' && <Accounts />}
              {section === 'foundation' && <FoundationView />}
            </>
          )}
          {busy && <div style={{ position: 'fixed', right: 24, bottom: 24 }}><div className="spin" /></div>}
        </div>
      </main>
    </div>
  )
}
