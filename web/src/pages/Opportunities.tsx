import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Opportunity } from '../api/types'
import { AsyncSection } from '../components/States'
import { BetSlip, type BetSlipSeed } from '../components/BetSlip'
import { useAsync, usePersistentState } from '../lib/useAsync'
import { useSettings } from '../lib/settings-context'
import { ago, american, kickoff, line as fmtLine, MARKET_LABEL, money, pct, prob, sideLabel } from '../lib/format'

export function OpportunitiesPage() {
  const { evThreshold, loading: settingsLoading } = useSettings()
  const [minEv, setMinEv] = usePersistentState<number | null>('minEv', null)
  const [slip, setSlip] = useState<BetSlipSeed | null>(null)

  // Default the slider to the configured threshold the first time settings arrive.
  useEffect(() => {
    if (minEv === null && !settingsLoading) setMinEv(evThreshold)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading, evThreshold])

  const effective = minEv ?? evThreshold
  const state = useAsync<Opportunity[]>(() => api.getOpportunities(effective), [effective])

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title-row">
          <h1>Alerts</h1>
          <button type="button" className="btn btn-sm" onClick={state.reload}>Refresh</button>
        </div>
        <div className="slider-row">
          <label htmlFor="minev">Min EV</label>
          <input
            id="minev"
            type="range"
            min={0}
            max={15}
            step={0.5}
            value={effective}
            onChange={(e) => setMinEv(Number(e.target.value))}
          />
          <span className="slider-value">{pct(effective)}</span>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            onClick={() => setMinEv(evThreshold)}
            title="Reset to the threshold from Settings"
          >
            reset
          </button>
        </div>
      </header>

      <AsyncSection state={state}>
        {(rows) => rows.length === 0
          ? <div className="state state-empty">Nothing clears {pct(effective)} EV right now.</div>
          : (
            <div className="opp-list">
              {rows.map((o) => (
                <article key={`${o.game_id}-${o.market}-${o.side}-${o.book}`} className="card opp-card">
                  <div className="opp-main">
                    <div className="opp-top">
                      <Link className="opp-game" to={`/#game-${o.game_id}`}>{o.away} @ {o.home}</Link>
                      <span className="opp-kick">{kickoff(o.kickoff)}</span>
                    </div>
                    <div className="opp-pick">
                      <strong>{sideLabel(o.market, o.side, o.home, o.away, o.line)}</strong>
                      <span className="muted"> · {MARKET_LABEL[o.market]}</span>
                      {o.market !== 'h2h' && o.line !== null && <span className="muted"> · {fmtLine(o.line, o.market)}</span>}
                    </div>
                    <div className="opp-meta">
                      <span className="book-name">{o.book_name}</span>
                      <span className={`badge badge-${o.jurisdiction}`}>{o.jurisdiction === 'reference' ? 'ref' : o.jurisdiction}</span>
                      <span className={`badge badge-trigger-${o.trigger}`}>{o.trigger}</span>
                      {o.is_best_price && <span className="badge badge-best">best</span>}
                      {o.is_stale_candidate && <span className="badge badge-stale">stale</span>}
                      <span className="muted">{ago(o.last_update)}</span>
                    </div>
                  </div>
                  <div className="opp-nums">
                    <div><span className="k">Price</span><span className="v price">{american(o.price_american)}</span></div>
                    <div><span className="k">Fair</span><span className="v">{prob(o.fair_p)}</span></div>
                    <div><span className="k">EV</span><span className="v pos">{pct(o.ev_pct)}</span></div>
                    <div><span className="k">Stake</span><span className="v">{money(o.kelly.recommended_stake)}</span></div>
                  </div>
                  <div className="opp-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setSlip({
                        game_id: o.game_id, home: o.home, away: o.away,
                        market: o.market, side: o.side, line: o.line,
                        book: o.book, book_name: o.book_name,
                        price_american: o.price_american,
                        fair_p: o.fair_p, ev_pct: o.ev_pct,
                        kelly_fraction_used: o.kelly.fraction_used,
                        recommended_stake: o.kelly.recommended_stake,
                        trigger: o.trigger,
                      })}
                    >
                      Log bet
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
      </AsyncSection>

      {slip && <BetSlip seed={slip} onClose={() => setSlip(null)} onLogged={state.reload} />}
    </div>
  )
}
