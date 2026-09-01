import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import type { Board, BoardGame, Market, MarketRow } from '../api/types'
import { AsyncSection } from '../components/States'
import { BetSlip, type BetSlipSeed } from '../components/BetSlip'
import { useAsync, usePersistentState } from '../lib/useAsync'
import { useSettings } from '../lib/settings-context'
import {
  ago, american, kickoff, line as fmtLine, MARKET_LABEL, money, num, pct, prob, sideLabel,
} from '../lib/format'

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1)
const MARKET_ORDER: Market[] = ['h2h', 'spreads', 'totals']

export function BoardPage() {
  const { evThreshold } = useSettings()
  const [week, setWeek] = usePersistentState<number>('week', 1)
  const [hideBelow, setHideBelow] = usePersistentState<boolean>('board.hideBelow', false)
  const [slip, setSlip] = useState<BetSlipSeed | null>(null)
  const state = useAsync<Board>(() => api.getBoard(week), [week])
  const location = useLocation()
  const scrolled = useRef<string | null>(null)

  // /opportunities links here with #game-<id>
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (!hash || state.loading || scrolled.current === hash) return
    const el = document.getElementById(hash)
    if (el) {
      el.scrollIntoView({ block: 'start' })
      scrolled.current = hash
    }
  }, [location.hash, state.loading])

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title-row">
          <h1>Board</h1>
          <select
            className="select"
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            aria-label="Week"
          >
            {WEEKS.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
        <BoardStrip data={state.data} threshold={evThreshold} />
        <label className="toggle-inline">
          <input type="checkbox" checked={hideBelow} onChange={(e) => setHideBelow(e.target.checked)} />
          <span>Only show rows at or above {pct(evThreshold)} EV</span>
        </label>
      </header>

      <AsyncSection state={state} empty="No games on the board for this week.">
        {(board) => (
          board.games.length === 0
            ? <div className="state state-empty">No games on the board for week {board.week}.</div>
            : (
              <div className="game-list">
                {board.games.map((g) => (
                  <GameCard
                    key={g.game_id}
                    game={g}
                    threshold={evThreshold}
                    hideBelow={hideBelow}
                    kellyFraction={board.kelly_fraction_this_week}
                    onLog={setSlip}
                  />
                ))}
              </div>
            )
        )}
      </AsyncSection>

      {slip && (
        <BetSlip
          seed={slip}
          onClose={() => setSlip(null)}
          onLogged={state.reload}
        />
      )}
    </div>
  )
}

function BoardStrip({ data, threshold }: { data: Board | null; threshold: number }) {
  if (!data) return <div className="strip strip-placeholder" />
  const c = data.credits
  return (
    <div className="strip">
      <div className="strip-item">
        <span className="strip-k">Credits</span>
        <span className="strip-v">{c.remaining.toLocaleString()}</span>
      </div>
      <div className="strip-item">
        <span className="strip-k">Week budget</span>
        <span className="strip-v">{c.used_week} / {c.budget_week}</span>
      </div>
      <div className="strip-item">
        <span className="strip-k">Kelly this week</span>
        <span className="strip-v">{data.kelly_fraction_this_week}×</span>
      </div>
      <div className="strip-item">
        <span className="strip-k">EV threshold</span>
        <span className="strip-v">{pct(threshold)}</span>
      </div>
      <div className="strip-item">
        <span className="strip-k">Fetched</span>
        <span className="strip-v">{ago(data.fetched_at)}</span>
      </div>
    </div>
  )
}

function GameCard({
  game, threshold, hideBelow, kellyFraction, onLog,
}: {
  game: BoardGame
  threshold: number
  hideBelow: boolean
  kellyFraction: number
  onLog: (s: BetSlipSeed) => void
}) {
  const byMarket = useMemo(() => {
    const m = new Map<Market, MarketRow[]>()
    for (const mk of MARKET_ORDER) m.set(mk, [])
    for (const row of game.markets) m.get(row.market)?.push(row)
    return m
  }, [game.markets])

  const makeSeed = useCallback((row: MarketRow): BetSlipSeed => ({
    game_id: game.game_id,
    home: game.home,
    away: game.away,
    market: row.market,
    side: row.side,
    line: row.line,
    book: row.book,
    book_name: row.book_name,
    price_american: row.price_american,
    fair_p: row.fair_p,
    ev_pct: row.ev_pct,
    kelly_fraction_used: row.kelly.fraction_used ?? kellyFraction,
    recommended_stake: row.kelly.recommended_stake,
    trigger: row.is_stale_candidate ? 'stale' : (row.ev_pct ?? 0) >= threshold ? 'threshold' : 'manual',
  }), [game, kellyFraction, threshold])

  return (
    <section className="card game-card" id={`game-${game.game_id}`}>
      <header className="game-head">
        <div>
          <div className="game-teams">
            <span className="team">{game.away}</span>
            <span className="at">@</span>
            <span className="team">{game.home}</span>
          </div>
          <div className="game-names">{game.away_name} at {game.home_name}</div>
        </div>
        <div className="game-kick">{kickoff(game.kickoff)}</div>
      </header>

      <div className="fairbox">
        <div className="fairbox-head">
          <span>Fair line</span>
          <span className="fairbox-src">{game.fair.source} · {ago(game.fair.updated_at)}</span>
        </div>
        <div className="fairbox-grid">
          <div><span className="k">{game.home} ML</span><span className="v">{prob(game.fair.home_ml_p)}</span></div>
          <div><span className="k">{game.away} ML</span><span className="v">{prob(game.fair.away_ml_p)}</span></div>
          <div><span className="k">Spread</span><span className="v">{fmtLine(game.fair.fair_spread)}</span></div>
          <div><span className="k">Total</span><span className="v">{game.fair.fair_total === null ? '—' : num(game.fair.fair_total, 1)}</span></div>
        </div>
      </div>

      {MARKET_ORDER.map((mk) => {
        const rows = byMarket.get(mk) ?? []
        if (rows.length === 0) return null
        return (
          <MarketTable
            key={mk}
            market={mk}
            rows={rows}
            game={game}
            threshold={threshold}
            hideBelow={hideBelow}
            onLog={(row) => onLog(makeSeed(row))}
          />
        )
      })}
    </section>
  )
}

function MarketTable({
  market, rows, game, threshold, hideBelow, onLog,
}: {
  market: Market
  rows: MarketRow[]
  game: BoardGame
  threshold: number
  hideBelow: boolean
  onLog: (row: MarketRow) => void
}) {
  const sides = market === 'totals' ? (['over', 'under'] as const) : (['home', 'away'] as const)
  const groups = sides.map((side) => ({
    side,
    rows: rows
      .filter((r) => r.side === side)
      .filter((r) => (hideBelow ? (r.ev_pct ?? -99) >= threshold : true))
      .sort((a, b) => (b.ev_pct ?? -999) - (a.ev_pct ?? -999)),
  })).filter((g) => g.rows.length > 0)

  if (groups.length === 0) return null

  return (
    <div className="market-block">
      <h3 className="market-title">{MARKET_LABEL[market]}</h3>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="col-book">Book</th>
              {market !== 'h2h' && <th className="num">Line</th>}
              <th className="num">Price</th>
              <th className="num">Impl</th>
              <th className="num">Fair</th>
              <th className="num">EV</th>
              <th className="num">Stake</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <SideGroup
                key={g.side}
                label={sideLabel(market, g.side, game.home, game.away, market === 'totals' ? null : undefined)}
                rows={g.rows}
                market={market}
                threshold={threshold}
                onLog={onLog}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SideGroup({
  label, rows, market, threshold, onLog,
}: {
  label: string
  rows: MarketRow[]
  market: Market
  threshold: number
  onLog: (row: MarketRow) => void
}) {
  return (
    <>
      <tr className="side-row">
        <th colSpan={market === 'h2h' ? 7 : 8} scope="colgroup">{label}</th>
      </tr>
      {rows.map((r) => (
        <MarketRowLine key={`${r.book}-${r.side}`} row={r} market={market} threshold={threshold} onLog={onLog} />
      ))}
    </>
  )
}

export function rowClass(ev: number | null, threshold: number): string {
  if (ev === null) return 'row-dim'
  if (ev >= threshold) return 'row-pos'
  if (ev < 0) return 'row-neg'
  return 'row-dim'
}

function MarketRowLine({
  row, market, threshold, onLog,
}: {
  row: MarketRow
  market: Market
  threshold: number
  onLog: (row: MarketRow) => void
}) {
  return (
    <tr className={rowClass(row.ev_pct, threshold)}>
      <td className="col-book">
        <span className="book-name">{row.book_name}</span>
        {row.jurisdiction !== 'AB' && <span className={`badge badge-${row.jurisdiction}`}>{row.jurisdiction === 'reference' ? 'ref' : row.jurisdiction}</span>}
        {row.is_stale_candidate && <span className="badge badge-stale" title={`Sharp line moved; last update ${ago(row.last_update)}`}>stale</span>}
      </td>
      {market !== 'h2h' && <td className="num">{row.line === null ? '—' : fmtLine(row.line, market)}</td>}
      <td className={`num price${row.is_best_price ? ' best' : ''}`}>{american(row.price_american)}</td>
      <td className="num muted">{prob(row.implied_p)}</td>
      <td className="num">{prob(row.fair_p)}</td>
      <td className={`num ev ${(row.ev_pct ?? 0) > 0 ? 'pos' : 'neg'}`}>{pct(row.ev_pct)}</td>
      <td className="num">
        {money(row.kelly.recommended_stake)}
        {row.kelly.capped && <span className="badge badge-cap" title={row.kelly.cap_reason ?? 'capped'}>cap</span>}
      </td>
      <td className="col-act">
        <button type="button" className="btn btn-xs" onClick={() => onLog(row)}>Log</button>
      </td>
    </tr>
  )
}
