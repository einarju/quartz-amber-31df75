/**
 * Inline SVG icons. No icon library: this app runs offline on localhost and a
 * dependency for eighteen paths is not worth it.
 *
 * All are 24x24, stroked with currentColor, so they inherit the neumorphic
 * text colours automatically.
 */

const PATHS = {
  bolt: 'M13 2 5 13.5h5.5L10 22l8-11.5h-5.5z',
  money: 'M12 2v20M16.5 7.5C16 5.9 14.3 5 12.3 5h-.8a3 3 0 0 0 0 6h1a3 3 0 0 1 0 6h-.9c-2 0-3.7-.9-4.2-2.5',
  wave: 'M3 11v2M7 7v10M11 4v16M15 8v8M19 10v4M21.5 11.5v1',
  briefcase: 'M3 8.5h18V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19zM8 8.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2.5M3 13h18',
  dumbbell: 'M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11',
  bulb: 'M9.5 18.5h5M10.5 21.5h3M12 2.5a6.5 6.5 0 0 0-4 11.6v2.4h8v-2.4A6.5 6.5 0 0 0 12 2.5z',
  calendar: 'M3.5 6.5h17v13a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM8 3.5v5M16 3.5v5M3.5 11h17',
  plus: 'M12 5.5v13M5.5 12h13',
  minus: 'M5.5 12h13',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  trash: 'M4 7h16M9.5 7V4.8h5V7M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6',
  chevronLeft: 'M15 4.5 7.5 12l7.5 7.5',
  chevronRight: 'M9 4.5 16.5 12 9 19.5',
  refresh: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 3.5v5h-5',
  flame: 'M12 2.5s5.5 4.8 5.5 9.5a5.5 5.5 0 0 1-11 0c0-1.6.7-3 1.7-4 .3 1.2 1 2 1.9 2.2C9.8 8.2 12 6.2 12 2.5z',
  target: 'M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3',
  ban: 'M5.6 5.6l12.8 12.8',
  fork: 'M6 3v7a2.2 2.2 0 0 0 4.4 0V3M8.2 10.2V21M17.5 3c-1.6 2.2-2.3 4.5-2.3 7.5h4.6c0-3-.7-5.3-2.3-7.5zM17.5 10.5V21',
  send: 'M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 10z',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.2 4.4a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7 2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.4 1z',
  trend: 'M3.5 16.5 9 11l4 4 7.5-7.5M15.5 7.5h5v5',
  archive: 'M3.5 4.5h17v4h-17zM5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M9.5 12.5h5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  layers: 'M12 3.5 21 8l-9 4.5L3 8zM3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
  external: 'M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5.5H4.5V6H10',
} as const

export type IconName = keyof typeof PATHS

/** Icons that need a circle behind the path (drawn first). */
const CIRCLED: Partial<Record<IconName, number>> = { target: 5, ban: 8.5 }

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const circle = CIRCLED[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'target' && <circle cx="12" cy="12" r="8.5" />}
      {circle !== undefined && <circle cx="12" cy="12" r={circle} />}
      <path d={PATHS[name]} />
    </svg>
  )
}
