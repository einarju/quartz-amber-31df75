import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppState } from '@shared/schema.ts'
import { getState } from './api.ts'
import { AuthError, getToken, setToken } from './github.ts'

type Store = {
  state: AppState | null
  error: string | null
  busy: boolean
  signedIn: boolean
  signIn: () => void
  signOut: () => void
  reload: () => Promise<void>
  /** Run a write; the answer is the fresh state, which replaces ours. */
  run: (write: () => Promise<AppState>) => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signedIn, setSignedIn] = useState(() => getToken() !== null)

  const signOut = useCallback(() => {
    setToken(null)
    setSignedIn(false)
    setState(null)
  }, [])

  const run = useCallback(async (write: () => Promise<AppState>) => {
    setBusy(true)
    try {
      setState(await write())
      setError(null)
    } catch (err) {
      if (err instanceof AuthError) {
        signOut()
        setError(err.message)
      } else {
        setError((err as Error).message)
        // A failed save reloaded the cache; show what is really on GitHub now.
        await getState().then(setState).catch(() => undefined)
      }
    } finally {
      setBusy(false)
    }
  }, [signOut])

  const reload = useCallback(() => run(getState), [run])

  useEffect(() => { if (signedIn) void reload() }, [signedIn, reload])
  // Pick up edits made on GitHub, by an agent or on another device when the tab regains focus.
  useEffect(() => {
    if (!signedIn) return
    const onFocus = () => { void reload() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [signedIn, reload])

  const signIn = useCallback(() => { setError(null); setSignedIn(true) }, [])

  return (
    <Ctx.Provider value={{ state, error, busy, signedIn, signIn, signOut, reload, run }}>
      {children}
    </Ctx.Provider>
  )
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

export function useAppState(): AppState {
  const { state } = useStore()
  if (!state) throw new Error('state not loaded')
  return state
}
