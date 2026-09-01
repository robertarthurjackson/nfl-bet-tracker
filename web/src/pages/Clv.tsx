import { api } from '../api'
import type { ClvReport } from '../api/types'
import { AsyncSection } from '../components/States'
import { ClvArrow, ResultBadge } from './Bets'
import { useAsync } from '../lib/useAsync'
import {
  american, dateTime, line as fmtLine, money, moneySigned, points, prob, probSigned, sideLabel,
} from '../lib/format'

export function ClvPage() {
  const state = useAsync<ClvReport>(() => api.getClv(), [])

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title-row">
          <h1>CLV</h1>
          <button type="button" className="btn btn-sm" onClick={state.reload}>Refresh</button>
        </div>
        <p className="prose-note">
          Closing line value is the empirical leading indicator for this whole exercise. Win/loss over a
          season is mostly noise, but the closing price is the market's best estimate — so consistently
          beating it is the evidence that the process is real. Read it this way: <strong>positive CLV with a
          poor W/L record is variance</strong> and you keep going; <strong>negative CLV with a good W/L record is
          luck</strong> and the process is not working, whatever the bankroll says.
        </p>
      </header>

      <AsyncSection state={state}>
        {(r) => (
          <>
            <div className="tiles">
              <Tile k="Closed bets" v={String(r.summary.n_closed)} />
              <Tile k="Avg CLV prob" v={probSigned(r.summary.avg_clv_prob)} tone={r.summary.avg_clv_prob >= 0 ? 'pos' : 'neg'} />
              <Tile k="Avg CLV points" v={points(r.summary.avg_clv_points)} tone={r.summary.avg_clv_points >= 0 ? 'pos' : 'neg'} />
              <Tile k="Toward" v={prob(r.summary.pct_toward)} tone="pos" />
              <Tile k="Against" v={prob(r.summary.pct_against)} tone="neg" />
              <Tile k="Flat" v={prob(r.summary.pct_flat)} />
            </div>

            <div className="two-col">
              <section className="card">
                <h2 className="card-title">By book</h2>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>Book</th><th className="num">n</th><th className="num">Avg CLV</th><th className="num">Toward</th><th className="num">Stale hit</th></tr>
                    </thead>
                    <tbody>
                      {r.by_book.length === 0 && <tr><td colSpan={5} className="muted">No closed bets yet.</td></tr>}
                      {r.by_book.map((b) => (
                        <tr key={b.book}>
                          <td className="nowrap">{b.book_name}</td>
                          <td className="num">{b.n}</td>
                          <td className={`num ${b.avg_clv_prob >= 0 ? 'pos' : 'neg'}`}>{probSigned(b.avg_clv_prob)}</td>
                          <td className="num">{prob(b.pct_toward)}</td>
                          <td className="num">{b.stale_hit_rate === null ? '—' : prob(b.stale_hit_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <h2 className="card-title">By trigger</h2>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>Trigger</th><th className="num">n</th><th className="num">Avg CLV</th><th className="num">Toward</th></tr>
                    </thead>
                    <tbody>
                      {r.by_trigger.length === 0 && <tr><td colSpan={4} className="muted">No closed bets yet.</td></tr>}
                      {r.by_trigger.map((t) => (
                        <tr key={t.trigger}>
                          <td><span className={`badge badge-trigger-${t.trigger}`}>{t.trigger}</span></td>
                          <td className="num">{t.n}</td>
                          <td className={`num ${t.avg_clv_prob >= 0 ? 'pos' : 'neg'}`}>{probSigned(t.avg_clv_prob)}</td>
                          <td className="num">{prob(t.pct_toward)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <section className="card">
              <h2 className="card-title">Closed bets</h2>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Placed</th><th>Game</th><th>Pick</th><th>Book</th>
                      <th className="num">Price</th><th className="num">Close</th>
                      <th className="num">Fair @ bet</th><th className="num">Fair @ close</th>
                      <th className="num">CLV pts</th><th className="num">CLV prob</th><th>Dir</th>
                      <th>Result</th><th className="num">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.bets.length === 0 && <tr><td colSpan={13} className="muted">No bets with closing data yet.</td></tr>}
                    {r.bets.map((b) => (
                      <tr key={b.id}>
                        <td className="nowrap">{dateTime(b.placed_at)}</td>
                        <td className="nowrap">{b.away} @ {b.home}</td>
                        <td className="nowrap">{sideLabel(b.market, b.side, b.home, b.away, b.line)}</td>
                        <td className="nowrap">{b.book_name}</td>
                        <td className="num price">{american(b.price_american)}</td>
                        <td className="num">
                          {b.closing_line === null ? '' : `${fmtLine(b.closing_line, b.market)} `}
                          {b.closing_price === null ? '—' : american(b.closing_price)}
                        </td>
                        <td className="num">{prob(b.fair_p_at_bet)}</td>
                        <td className="num">{prob(b.closing_fair_p)}</td>
                        <td className="num">{points(b.clv_points)}</td>
                        <td className={`num ${(b.clv_prob ?? 0) >= 0 ? 'pos' : 'neg'}`}>{probSigned(b.clv_prob)}</td>
                        <td className="nowrap"><ClvArrow dir={b.clv_direction} /></td>
                        <td><ResultBadge result={b.result} /></td>
                        <td className={`num ${(b.profit ?? 0) >= 0 ? 'pos' : 'neg'}`}>{b.profit === null ? '—' : moneySigned(b.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">Stake column omitted for width; totals live on the Bets page. Largest closed stake: {money(Math.max(0, ...r.bets.map((b) => b.stake)))}.</p>
            </section>
          </>
        )}
      </AsyncSection>
    </div>
  )
}

function Tile({ k, v, tone }: { k: string; v: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="tile">
      <div className="tile-k">{k}</div>
      <div className={`tile-v ${tone ?? ''}`}>{v}</div>
    </div>
  )
}
