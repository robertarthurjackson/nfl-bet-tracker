import type { Market, Side } from '../api/types'

const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

/** `$1,234.50` — negative renders as `-$1,234.50`. */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return moneyFmt.format(n)
}

/** `+$59.10` / `-$65.00` — for profit columns. */
export function moneySigned(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return (n > 0 ? '+' : '') + moneyFmt.format(n)
}

/** Percentages to one decimal: `4.6%`. */
export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function pctSigned(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}

/** A 0–1 probability as a percentage: `77.1%`. */
export function prob(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '—'
  return `${(p * 100).toFixed(digits)}%`
}

export function probSigned(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '—'
  const v = p * 100
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`
}

/** American odds always carry an explicit sign: `-110`, `+320`. */
export function american(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

/** A spread / total line with a sign where one is meaningful. */
export function line(v: number | null | undefined, market?: Market): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (market === 'totals') return v.toFixed(1)
  return `${v > 0 ? '+' : ''}${v % 1 === 0 ? v.toFixed(1) : v.toFixed(1)}`
}

export function points(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

export function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toFixed(digits)
}

const kickoffFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function kickoff(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : kickoffFmt.format(d)
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

/** `4m ago`, `3h ago`, `2d ago` — used for line freshness. */
export function ago(iso: string | null | undefined, from = Date.now()): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const mins = Math.max(0, Math.round((from - t) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export const MARKET_LABEL: Record<Market, string> = {
  h2h: 'Moneyline',
  spreads: 'Spread',
  totals: 'Total',
}

/** Human label for a side within a game, e.g. `JAX` / `Over 41.5`. */
export function sideLabel(
  market: Market, side: Side, home: string, away: string, lineValue?: number | null,
): string {
  if (market === 'totals') {
    const l = lineValue === null || lineValue === undefined ? '' : ` ${lineValue.toFixed(1)}`
    return `${side === 'over' ? 'Over' : 'Under'}${l}`
  }
  const team = side === 'home' ? home : away
  if (market === 'h2h') return team
  const l = lineValue === null || lineValue === undefined ? '' : ` ${lineValue > 0 ? '+' : ''}${lineValue.toFixed(1)}`
  return `${team}${l}`
}

export function decimalFromAmerican(a: number): number {
  return a > 0 ? 1 + a / 100 : 1 + 100 / -a
}
