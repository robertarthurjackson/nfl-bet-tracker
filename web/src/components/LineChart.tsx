import { useMemo } from 'react'
import { money, shortDate } from '../lib/format'

export interface Point { at: string; balance: number }

const W = 720
const H = 240
const PAD = { top: 16, right: 16, bottom: 26, left: 56 }

/** Hand-rolled SVG line chart — no chart library. */
export function LineChart({ points, startLine }: { points: Point[]; startLine?: number }) {
  const geom = useMemo(() => {
    if (points.length === 0) return null
    const xs = points.map((p) => Date.parse(p.at))
    const ys = points.map((p) => p.balance)
    if (startLine !== undefined) ys.push(startLine)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    let yMin = Math.min(...ys)
    let yMax = Math.max(...ys)
    const padY = Math.max(1, (yMax - yMin) * 0.12)
    yMin -= padY
    yMax += padY
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom
    const sx = (t: number) => PAD.left + (xMax === xMin ? innerW / 2 : ((t - xMin) / (xMax - xMin)) * innerW)
    const sy = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH
    const coords = points.map((p) => ({ x: sx(Date.parse(p.at)), y: sy(p.balance), p }))
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
    const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${coords[0].x.toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`
    const ticks = [yMin + (yMax - yMin) * 0.05, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.05]
    return { coords, path, area, sy, yMin, yMax, ticks, xMin, xMax }
  }, [points, startLine])

  if (!geom) return <div className="state state-empty">No balance history yet.</div>

  const last = geom.coords[geom.coords.length - 1]
  const first = geom.coords[0]
  const up = last.p.balance >= first.p.balance
  const stroke = up ? 'var(--pos)' : 'var(--neg)'

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bankroll balance over time">
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {geom.ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={geom.sy(t)} y2={geom.sy(t)} className="grid" />
          <text x={PAD.left - 8} y={geom.sy(t) + 4} className="axis" textAnchor="end">{money(t)}</text>
        </g>
      ))}
      {startLine !== undefined && (
        <line x1={PAD.left} x2={W - PAD.right} y1={geom.sy(startLine)} y2={geom.sy(startLine)} className="baseline" />
      )}
      <path d={geom.area} fill="url(#fill)" />
      <path d={geom.path} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {geom.coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2.6} fill={stroke}>
          <title>{`${shortDate(c.p.at)} — ${money(c.p.balance)}`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={H - 8} className="axis">{shortDate(points[0].at)}</text>
      <text x={W - PAD.right} y={H - 8} className="axis" textAnchor="end">{shortDate(points[points.length - 1].at)}</text>
    </svg>
  )
}
