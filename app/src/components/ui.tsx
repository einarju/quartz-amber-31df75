import type { CSSProperties, ReactNode } from 'react'
import type { ProjectAccent } from '@shared/schema.ts'
import { clamp01 } from '../lib/format.ts'
import { Icon } from './Icon.tsx'
import type { IconName } from './Icon.tsx'

/**
 * Neumorphic primitives. Every one of these is a thin wrapper over a class in
 * components.css - the styling lives there, the behaviour lives here.
 */

export function accentColor(accent: ProjectAccent = 'orange'): string {
  return `var(--${accent})`
}

export function accentGrad(accent: ProjectAccent = 'orange'): string {
  return `var(--${accent}-grad)`
}

/* ------------------------------------------------------------------- card */

export function Card({
  title, children, actions, accent, hero, tight, flush, style, className = '',
}: {
  title?: ReactNode
  children: ReactNode
  actions?: ReactNode
  accent?: ProjectAccent
  hero?: boolean
  tight?: boolean
  flush?: boolean
  style?: CSSProperties
  className?: string
}) {
  const classes = [
    'card',
    hero ? 'card--hero' : '',
    tight ? 'card--tight' : '',
    flush ? 'card--flush' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <section className={classes} style={style}>
      {(title || actions) && (
        <header className="card__head">
          {accent && <span className="card__accent" style={{ background: accentGrad(accent) }} />}
          <h2 className="card__title grow truncate">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function Well({ children, tight, style }: { children: ReactNode; tight?: boolean; style?: CSSProperties }) {
  return <div className={tight ? 'well well--tight' : 'well'} style={style}>{children}</div>
}

/* ----------------------------------------------------------------- button */

export function Btn({
  children, onClick, icon, variant = 'plain', size = 'md', disabled, title, type = 'button',
}: {
  children?: ReactNode
  onClick?: () => void
  icon?: IconName
  variant?: 'plain' | 'accent' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  const classes = [
    'btn',
    variant === 'accent' ? 'btn--accent' : '',
    variant === 'ghost' ? 'btn--ghost' : '',
    size === 'sm' ? 'btn--sm' : '',
    !children && icon ? 'btn--icon' : '',
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled} title={title}
      aria-label={!children && title ? title : undefined}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

/* ------------------------------------------------------ segmented control */

export function Seg<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          className="seg__btn"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- checkbox */

export function Check({
  label, checked, onChange, meta, avoid,
}: {
  label: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  meta?: ReactNode
  avoid?: boolean
}) {
  return (
    <button
      type="button"
      className={avoid ? 'check check--avoid' : 'check'}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="check__box"><Icon name="check" size={15} /></span>
      <span className="check__label truncate">{label}</span>
      {meta !== undefined && <span className="check__meta">{meta}</span>}
    </button>
  )
}

export function Toggle({
  on, onChange, label,
}: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" className="toggle" aria-pressed={on} aria-label={label}
      onClick={() => onChange(!on)} />
  )
}

/* ---------------------------------------------------------------- stepper */

export function Stepper({
  value, onChange, step = 1, max,
}: { value: number; onChange: (next: number) => void; step?: number; max?: number }) {
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" aria-label="decrease" disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - step))}>
        <Icon name="minus" size={14} />
      </button>
      <span className="stepper__value">{value}</span>
      <button type="button" className="stepper__btn" aria-label="increase"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(value + step)}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------- ring */

export function Ring({
  pct, value, label, color = 'var(--accent)', small,
}: {
  pct: number
  value: ReactNode
  label?: string
  color?: string
  small?: boolean
}) {
  return (
    <div
      className={small ? 'ring ring--sm' : 'ring'}
      style={{ '--pct': clamp01(pct), '--ring-color': color } as CSSProperties}
      role="img"
      aria-label={`${label ?? 'progress'}: ${Math.round(pct * 100)}%`}
    >
      <div className="ring__inner">
        <div className="ring__value">{value}</div>
        {label && <div className="ring__label">{label}</div>}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- progress */

export function Bar({ pct, fill, thick }: { pct: number; fill?: string; thick?: boolean }) {
  return (
    <div className={thick ? 'bar bar--thick' : 'bar'}
      style={{ '--pct': clamp01(pct) } as CSSProperties}>
      <div className="bar__fill" style={fill ? { background: fill } : undefined} />
    </div>
  )
}

/* ------------------------------------------------------------- bar chart */

export function Bars({
  data, fill, showAxis = true,
}: {
  data: { label: string; value: number }[]
  fill?: string
  showAxis?: boolean
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="bars">
        {data.map((d, i) => (
          <div className="bars__col" key={`${d.label}-${i}`} data-empty={d.value === 0}
            title={`${d.label}: ${d.value}`}>
            <div className="bars__fill"
              style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, ...(fill ? { background: fill } : {}) }} />
          </div>
        ))}
      </div>
      {showAxis && (
        <div className="bars__axis">
          {data.map((d, i) => <div className="bars__tick" key={`${d.label}-${i}`}>{d.label}</div>)}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ stat */

export function Stat({
  label, value, sub, tone, large,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'positive' | 'negative' | 'muted'
  large?: boolean
}) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className={`stat__value${large ? ' stat__value--lg' : ''}${tone ? ` ${tone}` : ''}`}>{value}</div>
      {sub !== undefined && <div className="stat__sub">{sub}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ pill */

export function Pill({
  children, tone, inset, title,
}: {
  children: ReactNode
  tone?: 'accent' | 'positive' | 'negative' | 'warn'
  inset?: boolean
  /** Hover text, for the pills that compress a number down to a symbol. */
  title?: string
}) {
  const classes = ['pill', tone ? `pill--${tone}` : '', inset ? 'pill--in' : ''].filter(Boolean).join(' ')
  return <span className={classes} title={title}>{children}</span>
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />
}

/* ---------------------------------------------------------------- funnel */

export function Funnel({ rows, color = 'var(--accent-grad)' }: {
  rows: { label: string; count: number }[]
  color?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="funnel">
      {rows.map((r) => (
        <div className="funnel__row" key={r.label}>
          <span className="funnel__name">{r.label}</span>
          <Bar pct={r.count / max} fill={color} />
          <span className="funnel__count">{r.count}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ heat */

export function Heat({
  days, today, onPick,
}: {
  days: { date: string; pct: number; logged: boolean; future: boolean }[]
  today: string
  onPick?: (date: string) => void
}) {
  return (
    <div className="heat">
      {days.map((d) => {
        const level = d.future || !d.logged ? 0 : Math.min(4, Math.ceil(d.pct * 4))
        return (
          <div
            key={d.date}
            className="heat__cell"
            data-level={level}
            data-today={d.date === today}
            data-future={d.future}
            title={`${d.date} - ${d.logged ? `${Math.round(d.pct * 100)}%` : 'not logged'}`}
            onClick={onPick ? () => onPick(d.date) : undefined}
            style={onPick ? { cursor: 'pointer' } : undefined}
          />
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- misc */

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>
}

export function Divider() {
  return <div className="divider" />
}
