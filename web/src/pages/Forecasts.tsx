import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Forecast, ForecastScore, Game, Market, Side } from '../api/types'
import { AsyncSection, ErrorBanner, Loading } from '../components/States'
import { useToast } from '../components/Toast'
import { errorMessage, useAsync, usePersistentState } from '../lib/useAsync'
import { dateTime, line as fmtLine, MARKET_LABEL, num, prob, sideLabel } from '../lib/format'

const MARKETS: Market[] = ['h2h', 'spreads', 'totals']
const sidesFor = (m: Market): Side[] => (m === 'totals' ? ['over', 'under'] : ['home', 'away'])

export function ForecastsPage() {
  const toast = useToast()
  const [week] = usePersistentState<number>('week', 1)
  const games = useAsync<Game[]>(() => api.getGames(week), [week])
  const list = useAsync<Forecast[]>(() => api.getForecasts(), [])
  const score = useAsync<ForecastScore>(() => api.getForecastScore(), [])

  const [gameId, setGameId] = useState('')
  const [market, setMarket] = useState<Market>('spreads')
  const [side, setSide] = useState<Side>('home')
  const [lineValue, setLineValue] = useState('')
  const [myPct, setMyPct] = useState('55')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!gameId && games.data && games.data.length > 0) setGameId(games.data[0].game_id)
  }, [games.data, gameId])

  useEffect(() => {
    if (!sidesFor(market).includes(side)) setSide(sidesFor(market)[0])
  }, [market, side])

  const game = useMemo(() => games.data?.find((g) => g.game_id === gameId) ?? null, [games.data, gameId])

  async function submit() {
    const p = Number(myPct)
    if (!gameId) { toast.error('Pick a game.'); return }
    if (!Number.isFinite(p) || p <= 0 || p >= 100) { toast.error('Probability must be between 0 and 100.'); return }
    if (market !== 'h2h' && lineValue.trim() === '') { toast.error('A spread or total needs a line.'); return }
    setSaving(true)
    try {
      await api.createForecast({
        game_id: gameId,
        market,
        side,
        line: market === 'h2h' ? null : Number(lineValue),
        my_p: p / 100,
        note,
      })
      toast.success('Forecast logged')
      setNote('')
      list.reload()
      score.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(f: Forecast) {
    if (!window.confirm(`Delete forecast #${f.id}?`)) return
    try {
      await api.deleteForecast(f.id)
      toast.success('Forecast deleted')
      list.reload()
      score.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Shadow forecasts</h1>
        <p className="prose-note">
          Opinions with no money on them. Logged against the market price at the time and scored later, so
          you can tell a genuine read on a game apart from simply catching stale prices.
        </p>
      </header>

      <section className="card">
        <h2 className="card-title">Log a forecast — week {week}</h2>
        {games.error && <ErrorBanner message={games.error} onRetry={games.reload} />}
        {games.loading && <Loading label="Loading games…" />}
        {games.data && (
          <>
            <div className="form-grid">
              <label className="field field-wide">
                <span>Game</span>
                <select className="select" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                  {games.data.map((g) => (
                    <option key={g.game_id} value={g.game_id}>{g.away} @ {g.home}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Market</span>
                <select className="select" value={market} onChange={(e) => setMarket(e.target.value as Market)}>
                  {MARKETS.map((m) => <option key={m} value={m}>{MARKET_LABEL[m]}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Side</span>
                <select className="select" value={side} onChange={(e) => setSide(e.target.value as Side)}>
                  {sidesFor(market).map((s) => (
                    <option key={s} value={s}>
                      {game ? sideLabel(market, s, game.home, game.away, null) : s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Line</span>
                <input
                  type="text" inputMode="decimal" value={lineValue}
                  disabled={market === 'h2h'} placeholder={market === 'h2h' ? 'n/a' : '-7.5'}
                  onChange={(e) => setLineValue(e.target.value)}
                />
              </label>
              <label className="field">
                <span>My probability (%)</span>
                <input type="text" inputMode="decimal" value={myPct} onChange={(e) => setMyPct(e.target.value)} />
              </label>
              <label className="field field-wide">
                <span>Note</span>
                <input type="text" value={note} placeholder="what you think the market is missing" onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
                {saving ? 'Saving…' : 'Log forecast'}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Scoring</h2>
        <AsyncSection state={score}>
          {(s) => (
            <>
              <div className="tiles">
                <div className="tile"><div className="tile-k">Scored</div><div className="tile-v">{s.n_scored}</div></div>
                <div className="tile"><div className="tile-k">Brier — mine</div><div className="tile-v">{num(s.brier_mine, 3)}</div></div>
                <div className="tile"><div className="tile-k">Brier — market</div><div className="tile-v">{num(s.brier_market, 3)}</div></div>
                <div className="tile"><div className="tile-k">Log loss — mine</div><div className="tile-v">{num(s.log_loss_mine, 3)}</div></div>
                <div className="tile"><div className="tile-k">Log loss — market</div><div className="tile-v">{num(s.log_loss_market, 3)}</div></div>
              </div>
              <div className={`verdict verdict-${s.verdict}`}>
                {s.verdict === 'mine' && 'Your numbers are beating the market on this sample. Lower scores are better on both metrics.'}
                {s.verdict === 'market' && 'The market is beating your numbers on this sample. Lower scores are better on both metrics.'}
                {s.verdict === 'insufficient' && 'Not enough scored forecasts yet to call it either way.'}
              </div>
              {s.calibration.length > 0 && (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>Bucket</th><th className="num">n</th><th className="num">Predicted (mine)</th><th className="num">Predicted (market)</th><th className="num">Actual</th></tr>
                    </thead>
                    <tbody>
                      {s.calibration.map((c) => (
                        <tr key={c.bucket}>
                          <td>{c.bucket}</td>
                          <td className="num">{c.n}</td>
                          <td className="num">{prob(c.predicted_mine)}</td>
                          <td className="num">{prob(c.predicted_market)}</td>
                          <td className="num">{prob(c.actual)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </AsyncSection>
      </section>

      <section className="card">
        <h2 className="card-title">Forecasts</h2>
        <AsyncSection state={list}>
          {(rows) => rows.length === 0
            ? <div className="state state-empty">No forecasts logged yet.</div>
            : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Logged</th><th>Game</th><th>Pick</th>
                      <th className="num">My p</th><th className="num">Market p</th><th className="num">Edge</th>
                      <th>Outcome</th><th>Note</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => {
                      const edge = f.market_p_at_time === null ? null : f.my_p - f.market_p_at_time
                      return (
                        <tr key={f.id}>
                          <td className="nowrap">{dateTime(f.created_at)}</td>
                          <td className="nowrap">{f.away} @ {f.home} <span className="muted">W{f.week}</span></td>
                          <td className="nowrap">
                            {sideLabel(f.market, f.side, f.home, f.away, f.line)}
                            <span className="muted"> · {MARKET_LABEL[f.market]}</span>
                            {f.market !== 'h2h' && f.line !== null && <span className="muted"> · {fmtLine(f.line, f.market)}</span>}
                          </td>
                          <td className="num">{prob(f.my_p)}</td>
                          <td className="num">{prob(f.market_p_at_time)}</td>
                          <td className={`num ${(edge ?? 0) >= 0 ? 'pos' : 'neg'}`}>{edge === null ? '—' : `${edge > 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`}</td>
                          <td>
                            {f.outcome === null
                              ? <span className="badge badge-open">pending</span>
                              : <span className={`badge badge-${f.outcome === 1 ? 'win' : 'loss'}`}>{f.outcome === 1 ? 'hit' : 'miss'}</span>}
                          </td>
                          <td className="note-cell">{f.note || <span className="muted">—</span>}</td>
                          <td className="col-act">
                            <button type="button" className="btn btn-xs btn-danger" onClick={() => remove(f)}>del</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </AsyncSection>
      </section>
    </div>
  )
}
