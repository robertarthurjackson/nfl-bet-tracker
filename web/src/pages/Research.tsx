import { api } from '../api'
import type { BacktestFavorites, BacktestKeyNumbers, MarginFreq } from '../api/types'
import { AsyncSection } from '../components/States'
import { useAsync } from '../lib/useAsync'
import { num, pct, prob } from '../lib/format'

export function ResearchPage() {
  const favs = useAsync<BacktestFavorites>(() => api.getBacktestFavorites(), [])
  const keys = useAsync<BacktestKeyNumbers>(() => api.getBacktestKeyNumbers(), [])

  return (
    <div className="page">
      <header className="page-head">
        <h1>Research</h1>
        <p className="prose-note">
          Backtests over the nflverse game history. Both panels exist to calibrate intuition, not to
          generate picks: what favourites actually return, and which margins are worth paying for.
        </p>
      </header>

      <section className="card">
        <h2 className="card-title">Moneyline favourites by price bucket</h2>
        <AsyncSection state={favs}>
          {(f) => (
            <>
              <p className="muted small">{f.from}–{f.to} · {f.n_games.toLocaleString()} games · {f.note}</p>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Bucket</th><th className="num">n</th><th className="num">Wins</th>
                      <th className="num">Win %</th><th className="num">Implied %</th>
                      <th className="num">ROI %</th><th className="num">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.buckets.map((b) => (
                      <tr key={b.bucket} className={b.roi_pct > 0 ? 'row-pos' : 'row-dim'}>
                        <td className="nowrap">{b.bucket}</td>
                        <td className="num">{b.n.toLocaleString()}</td>
                        <td className="num">{b.wins.toLocaleString()}</td>
                        <td className="num">{prob(b.win_pct)}</td>
                        <td className="num muted">{prob(b.implied_p)}</td>
                        <td className={`num ${b.roi_pct >= 0 ? 'pos' : 'neg'}`}>{pct(b.roi_pct)}</td>
                        <td className={`num ${b.units >= 0 ? 'pos' : 'neg'}`}>{num(b.units, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </AsyncSection>
      </section>

      <section className="card">
        <h2 className="card-title">Key numbers — margin of victory</h2>
        <AsyncSection state={keys}>
          {(k) => (
            <>
              <p className="muted small">{k.n_games.toLocaleString()} games. Frequency that the game landed on each exact margin.</p>
              <MarginChart margins={k.margins} />
              <h3 className="sub-title">Half-point value</h3>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>From</th><th>To</th><th className="num">Δ win probability</th></tr>
                  </thead>
                  <tbody>
                    {k.half_point_value.map((h) => (
                      <tr key={`${h.from}-${h.to}`} className={h.delta_p >= 0.02 ? 'row-pos' : ''}>
                        <td className="num">{num(h.from, 1)}</td>
                        <td className="num">{num(h.to, 1)}</td>
                        <td className="num">{prob(h.delta_p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="prose">
                <h3>How to read this</h3>
                <p>
                  Each bar is the share of games that ended with <em>exactly</em> that margin of victory.
                  NFL scoring comes in 3s and 7s, so the distribution spikes hard on those numbers —
                  roughly one game in ten lands on exactly 3 — while margins like 5, 9 and 11 barely happen.
                  If margins were smooth, every bar would match its neighbours; the money is in the fact that
                  they don&rsquo;t.
                </p>
                <p>
                  A half point only matters in the games that land exactly on the number it crosses.
                  Holding +3.5 instead of +2.5 flips every 3-point loss into a win — that&rsquo;s the ~10% of
                  games under the tallest bar. The same half point between 4.5 and 5.5 crosses almost nothing.
                  The table above quantifies it: crossing <strong>3</strong> is worth ~9 points of win
                  probability (priced at the number), crossing <strong>7</strong> ~4&ndash;6, most other numbers 2&ndash;3.
                </p>
                <ul>
                  <li><strong>Line shopping is number shopping.</strong> +3.5 at &minus;120 usually beats +3 at &minus;105.
                    You don&rsquo;t have to do this math — the board&rsquo;s FAIR and EV columns already price every
                    book&rsquo;s line off this distribution, which is why the best-price ★ sometimes sits on a worse
                    price at a better number.</li>
                  <li><strong>Buying points is a ripoff except across 3 (and sometimes 7).</strong> Books charge
                    ~10&cent; per half point everywhere; the chart shows it&rsquo;s worth ~25&cent;+ across 3 and nearly
                    nothing across 5 — and most books now surcharge or refuse the moves that favour you.</li>
                  <li><strong>Context matters.</strong> The Δ values are computed with the game priced at the key
                    number itself — crossing 3 in a game spread at &minus;9 is worth far less, and the engine
                    accounts for that automatically.</li>
                </ul>
              </div>
            </>
          )}
        </AsyncSection>
      </section>
    </div>
  )
}

const W = 720
const H = 240
const PAD = { top: 14, right: 10, bottom: 30, left: 44 }

function MarginChart({ margins }: { margins: MarginFreq[] }) {
  const rows = margins.filter((m) => m.margin >= 1 && m.margin <= 14).sort((a, b) => a.margin - b.margin)
  if (rows.length === 0) return <div className="state state-empty">No margin data.</div>
  const max = Math.max(...rows.map((r) => r.freq))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = innerW / rows.length
  const barW = Math.min(38, slot * 0.66)
  const ticks = [0, max / 2, max]

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Frequency of each margin of victory">
      {ticks.map((t, i) => (
        <g key={i}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH - (t / max) * innerH} y2={PAD.top + innerH - (t / max) * innerH} />
          <text className="axis" x={PAD.left - 8} y={PAD.top + innerH - (t / max) * innerH + 4} textAnchor="end">{(t * 100).toFixed(1)}%</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const h = (r.freq / max) * innerH
        const x = PAD.left + i * slot + (slot - barW) / 2
        const y = PAD.top + innerH - h
        const key = r.margin === 3 || r.margin === 7 || r.margin === 10 || r.margin === 14
        return (
          <g key={r.margin}>
            <rect x={x} y={y} width={barW} height={h} rx={2} className={key ? 'bar bar-key' : 'bar'}>
              <title>{`Margin ${r.margin}: ${(r.freq * 100).toFixed(1)}%`}</title>
            </rect>
            <text className="axis" x={x + barW / 2} y={H - 10} textAnchor="middle">{r.margin}</text>
          </g>
        )
      })}
    </svg>
  )
}
