import type { BarStat, CheckItem } from '@shared/schema.ts'

/** Same scoring as scripts/progress.py and the server: share of ticked boxes, rounded. */
export function bar(items: CheckItem[]): BarStat {
  const done = items.filter((i) => i.done).length
  return { pct: items.length ? Math.round((100 * done) / items.length) : 0, done, total: items.length }
}
