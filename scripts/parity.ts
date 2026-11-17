/**
 * Checks that shared/core.ts scores every business exactly like the registry's scripts/progress.py.
 * Usage: npm run parity -- <path to a clone of the holding registry>
 * Runs progress.py --json there and compares Build, Automation, Improvements and stage.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseBusiness } from '../shared/core.ts'

const root = process.argv[2]
if (!root) throw new Error('Pass the path to the holding registry clone.')
const py = JSON.parse(execFileSync('python3', [join(root, 'scripts/progress.py'), '--json'], { encoding: 'utf8' }))
  .businesses as Record<string, any>[]

let bad = 0
const dir = join(root, 'businesses')
for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
  const ts = parseBusiness(file, readFileSync(join(dir, file), 'utf8'))
  const p = py.find((r) => r.file === file)
  const pick = (b: { pct: number; done: number; total: number; next: string[] }) =>
    JSON.stringify([b.pct, b.done, b.total, b.next.map((n) => n.trim())])
  const pairs: [string, string, string][] = [
    ['build', pick(ts.buildBar), p && pick(p.build)],
    ['automation', pick(ts.automationBar), p && pick(p.automation)],
    ['improvements', pick(ts.improvementsBar), p && pick(p.improvements)],
    ['stage', ts.stage, p?.stage],
  ]
  const diffs = pairs.filter(([, a, b]) => a !== b)
  bad += diffs.length
  const s = (b: { pct: number; done: number; total: number }) => `${b.pct}% ${b.done}/${b.total}`
  console.log(`${diffs.length ? 'DIFF' : 'ok  '} ${file.padEnd(28)} B ${s(ts.buildBar).padEnd(11)} A ${s(ts.automationBar).padEnd(11)} I ${s(ts.improvementsBar).padEnd(11)} ${ts.stage}`)
  for (const [k, a, b] of diffs) console.log(`     ${k}: core.ts ${a} vs progress.py ${b}`)
}
if (bad) { console.error(`${bad} mismatch(es)`); process.exit(1) }
console.log('core.ts and progress.py agree on every business.')
