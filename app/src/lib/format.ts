/** Display formatting. Never used to compute anything. */

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
})

const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export function money(value: number, cents = false): string {
  return (cents ? usd2 : usd0).format(value)
}

/** Big numbers on the hero card, where the currency symbol is set separately. */
export function bareMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(value))
}

/**
 * Money in any currency, with the symbol the locale actually uses.
 *
 * Formatters are cached because these run inside render loops and building an
 * Intl.NumberFormat is the expensive part.
 */
const formatters = new Map<string, Intl.NumberFormat>()

export function inCurrency(value: number, currency: string, digits = 0): string {
  const key = `${currency}:${digits}`
  let fmt = formatters.get(key)
  if (fmt === undefined) {
    try {
      fmt = new Intl.NumberFormat('en-US', {
        style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: 0,
      })
    } catch {
      // An unknown code should show a plain number, not blank the whole card.
      fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits })
    }
    formatters.set(key, fmt)
  }
  return fmt.format(value)
}

/** Shortens to 12.4k / 1.2M so a big number still fits its box. */
export function compact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`
  if (abs >= 1_000) return `${(value / 1000).toFixed(1)}k`
  return String(Math.round(value))
}

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function kg(value: number | null, digits = 1): string {
  return value === null ? '--' : `${value.toFixed(digits)} kg`
}

export function signed(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits))
  return `${rounded > 0 ? '+' : ''}${rounded}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
