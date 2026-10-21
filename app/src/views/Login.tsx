import { useState } from 'react'
import { Btn, Card } from '../components/ui.tsx'
import { REPO, verifyToken } from '../lib/github.ts'
import { useStore } from '../lib/store.tsx'

const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new'

/** The first thing anyone sees. The page holds no data; the token is what unlocks the private repo. */
export function Login() {
  const { signIn, error } = useStore()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(error)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      await verifyToken(token.trim())
      signIn()
    } catch (err) {
      setProblem((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <Card hero>
        <form className="col" style={{ gap: 'var(--s-4)' }} onSubmit={submit}>
          <div className="login__mark">11</div>
          <h1>Sign in</h1>
          <input className="field" type="password" autoComplete="current-password" placeholder="GitHub access token"
            aria-label="GitHub access token" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
          {problem && <p className="negative small">{problem}</p>}
          <Btn type="submit" variant="accent" disabled={!token.trim() || busy}>{busy ? 'Checking' : 'Sign in'}</Btn>
          <details className="small muted">
            <summary>First time on this device?</summary>
            <ol className="steps" style={{ marginTop: 'var(--s-2)' }}>
              <li>Open <a className="link" href={NEW_TOKEN} target="_blank" rel="noreferrer">GitHub, new fine-grained token</a>.</li>
              <li>Repository access: only <b>{REPO}</b>.</li>
              <li>Permissions: <b>Contents, Read and write</b>. Nothing else.</li>
              <li>Generate, copy, paste it above. This browser remembers it.</li>
            </ol>
          </details>
        </form>
      </Card>
    </div>
  )
}
