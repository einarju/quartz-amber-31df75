/**
 * The data layer: the private einarju/holding repo, through GitHub's REST API.
 * The site itself holds no data. Without a token that can read that repo, it shows nothing.
 */

export const REPO = 'einarju/holding'
const API = `https://api.github.com/repos/${REPO}`
const TOKEN_KEY = 'holding.token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token: string | null): void {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY) } catch { /* private window */ }
}

export class AuthError extends Error {}

async function gh(path: string, init: RequestInit = {}, raw = false): Promise<Response> {
  const token = getToken()
  if (!token) throw new AuthError('Not signed in')
  const res = await fetch(`${API}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new Error('GitHub rate limit reached. Wait a few minutes and reload.')
  }
  if (res.status === 401 || res.status === 403) throw new AuthError('GitHub rejected the token. It may be expired or revoked.')
  // 404 is what GitHub answers when a token cannot see a private repo.
  if (res.status === 404 && path === '') throw new AuthError(`This token cannot see ${REPO}. Give it access to that repository.`)
  return res
}

/** Check a token before keeping it: it must read the repo and be allowed to write contents. */
export async function verifyToken(token: string): Promise<void> {
  setToken(token)
  try {
    const res = await gh('')
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const repo = (await res.json()) as { permissions?: { push?: boolean } }
    if (repo.permissions && !repo.permissions.push) {
      throw new AuthError('This token can read but not save. Give it "Contents: Read and write".')
    }
  } catch (err) {
    setToken(null)
    throw err
  }
}

export type RemoteFile = { path: string; text: string; sha: string }

type Entry = { name: string; path: string; sha: string; type: string }

async function list(dir: string): Promise<Entry[]> {
  const res = await gh(`/contents/${dir}?ref=main`)
  if (!res.ok) throw new Error(`Could not list ${dir || 'the repo'} (${res.status})`)
  return (await res.json()) as Entry[]
}

async function read(path: string, sha: string): Promise<RemoteFile> {
  const res = await gh(`/contents/${path}?ref=main`, {}, true)
  if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`)
  return { path, sha, text: await res.text() }
}

/** Everything the dashboard needs, read fresh from main. */
export async function readAll(): Promise<{ root: Map<string, RemoteFile>; businesses: RemoteFile[] }> {
  const [root, biz] = await Promise.all([list(''), list('businesses')])
  const want = ['foundation.md', 'todos.md', 'payments.md']
  const rootFiles = await Promise.all(want.map((name) => {
    const e = root.find((x) => x.name === name)
    if (!e) throw new Error(`${name} is missing from ${REPO}`)
    return read(e.path, e.sha)
  }))
  const businesses = await Promise.all(biz.filter((e) => e.type === 'file' && e.name.endsWith('.md')).map((e) => read(e.path, e.sha)))
  return { root: new Map(rootFiles.map((f) => [f.path, f])), businesses }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Commit one file. Returns the new sha. A stale sha means someone else saved first. */
export async function write(file: RemoteFile, text: string, message: string): Promise<string> {
  const res = await gh(`/contents/${file.path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(text), sha: file.sha, branch: 'main' }),
  })
  if (res.status === 409 || res.status === 422) {
    throw new Error(`${file.path} changed somewhere else since this page loaded. Reloaded; try again.`)
  }
  if (!res.ok) throw new Error(`Saving ${file.path} failed (${res.status})`)
  const body = (await res.json()) as { content: { sha: string } }
  return body.content.sha
}
