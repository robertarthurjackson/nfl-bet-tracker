import { useMemo, useState } from 'react'
import { api } from '../api'
import type { Bet, BetResult } from '../api/types'
import { AsyncSection } from '../components/States'
import { useToast } from '../components/Toast'
import { errorMessage, useAsync } from '../lib/useAsync'
import {
  american, dateTime, kickoff, line as fmtLine, MARKET_LABEL, money, moneySigned, pct, points,
  probSigned, sideLabel,
} from '../lib/format'

const RESULTS: Array<Exclude<BetResult, null>> = ['win', 'loss', 'push', 'void']

export function ClvArrow({ dir }: { dir: Bet['clv_direction'] }) {
  if (dir === null) return <span className="muted">—</span>
  const glyph = dir === 'toward' ? '↑' : dir === 'against' ? '↓' : '→'
  return <span className={`clv-dir clv-${dir}`} title={dir}>{glyph} {dir}</span>
}

export function ResultBadge({ result }: { result: BetResult }) {
  if (result === null) return <span className="badge badge-open">open</span>
  return <span className={`badge badge-${result}`}>{result}</span>
}

export function BetsPage() {
  const toast = useToast()
  const state = useAsync<Bet[]>(() => api.getBets(), [])
  const [week, setWeek] = useState<string>('all')
  const [result, setResult] = useState<string>('all')
  const [openRow, setOpenRow] = useState<number | null>(null)

  const bets = state.data ?? []
  const weeks = useMemo(
    () => [...new Set(bets.map((b) => b.week))].sort((a, b) => a - b),
    [bets],
  )

  const filtered = useMemo(() => bets.filter((b) => {
    if (week !== 'all' && b.week !== Number(week)) return false
    if (result === 'all') return true
    if (result === 'open') return b.result === null
    return b.result === result
  }), [bets, week, result])

  const totals = useMemo(() => {
    const settled = filtered.filter((b) => b.result !== null && b.result !== 'void')
    const staked = settled.reduce((s, b) => s + b.stake, 0)
    const profit = settled.reduce((s, b) => s + (b.profit ?? 0), 0)
    return {
      staked,
      profit,
      roi: staked ? (profit / staked) * 100 : 0,
      wins: settled.filter((b) => b.result === 'win').length,
      losses: settled.filter((b) => b.result === 'loss').length,
      pushes: settled.filter((b) => b.result === 'push').length,
      open: filtered.filter((b) => b.result === null).length,
    }
  }, [filtered])

  async function act(fn: () => Promise<void>, msg: string) {
    try {
      await fn()
      toast.success(msg)
      state.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const grade = (b: Bet, r: BetResult) => act(() => api.patchBet(b.id, { result: r }), `Bet #${b.id} marked ${r ?? 'open'}`)
  const remove = (b: Bet) => {
    if (!window.confirm(`Delete bet #${b.id} (${money(b.stake)} on ${b.away} @ ${b.home})?`)) return
    void act(() => api.deleteBet(b.id), `Bet #${b.id} deleted`)
  }
  const editNote = (b: Bet) => {
    const next = window.prompt('Note', b.note ?? '')
    if (next === null) return
    void act(() => api.patchBet(b.id, { note: next }), `Note updated`)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title-row">
          <h1>Bets</h1>
          <button type="button" className="btn btn-sm" onClick={state.reload}>Refresh</button>
        </div>
        <div className="strip">
          <div className="strip-item"><span className="strip-k">Staked</span><span className="strip-v">{money(totals.staked)}</span></div>
          <div className="strip-item"><span className="strip-k">Profit</span><span className={`strip-v ${totals.profit >= 0 ? 'pos' : 'neg'}`}>{moneySigned(totals.profit)}</span></div>
          <div className="strip-item"><span className="strip-k">ROI</span><span className={`strip-v ${totals.roi >= 0 ? 'pos' : 'neg'}`}>{pct(totals.roi)}</span></div>
          <div className="strip-item"><span className="strip-k">Record</span><span className="strip-v">{totals.wins}-{totals.losses}-{totals.pushes}</span></div>
          <div className="strip-item"><span className="strip-k">Open</span><span className="strip-v">{totals.open}</span></div>
        </div>
        <div className="filter-row">
          <label className="field-inline">
            <span>Week</span>
            <select className="select" value={week} onChange={(e) => setWeek(e.target.value)}>
              <option value="all">All</option>
              {weeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </label>
          <label className="field-inline">
            <span>Result</span>
            <select className="select" value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
      </header>

      <AsyncSection state={state}>
        {() => filtered.length === 0
          ? <div className="state state-empty">No bets match this filter.</div>
          : (
            <div className="card">
              <div className="table-wrap">
                <table className="tbl tbl-bets">
                  <thead>
                    <tr>
                      <th>Placed</th>
                      <th>Game</th>
                      <th>Pick</th>
                      <th>Book</th>
                      <th className="num">Price</th>
                      <th className="num">Stake</th>
                      <th>Result</th>
                      <th className="num">Profit</th>
                      <th className="num">CLV pts</th>
                      <th className="num">CLV prob</th>
                      <th>Dir</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b) => (
                      <BetRows
                        key={b.id}
                        bet={b}
                        open={openRow === b.id}
                        onToggle={() => setOpenRow(openRow === b.id ? null : b.id)}
                        onGrade={grade}
                        onNote={editNote}
                        onDelete={remove}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </AsyncSection>
    </div>
  )
}

function BetRows({
  bet: b, open, onToggle, onGrade, onNote, onDelete,
}: {
  bet: Bet
  open: boolean
  onToggle: () => void
  onGrade: (b: Bet, r: BetResult) => void
  onNote: (b: Bet) => void
  onDelete: (b: Bet) => void
}) {
  return (
    <>
      <tr className={b.result === null ? 'row-open' : ''}>
        <td className="nowrap">{dateTime(b.placed_at)}</td>
        <td className="nowrap">{b.away} @ {b.home} <span className="muted">W{b.week}</span></td>
        <td className="nowrap">
          {sideLabel(b.market, b.side, b.home, b.away, b.line)}
          <span className="muted"> · {MARKET_LABEL[b.market]}</span>
        </td>
        <td className="nowrap">{b.book_name}</td>
        <td className="num price">{american(b.price_american)}</td>
        <td className="num">{money(b.stake)}</td>
        <td><ResultBadge result={b.result} /></td>
        <td className={`num ${(b.profit ?? 0) >= 0 ? 'pos' : 'neg'}`}>{b.profit === null ? '—' : moneySigned(b.profit)}</td>
        <td className="num">{points(b.clv_points)}</td>
        <td className="num">{probSigned(b.clv_prob)}</td>
        <td className="nowrap"><ClvArrow dir={b.clv_direction} /></td>
        <td className="col-act">
          <button type="button" className="btn btn-xs" onClick={onToggle} aria-expanded={open}>
            {open ? 'Close' : 'Edit'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={12}>
            <div className="bet-detail">
              <div className="bet-detail-facts">
                <span><b>Kickoff</b> {kickoff(b.kickoff)}</span>
                <span><b>Line</b> {b.line === null ? '—' : fmtLine(b.line, b.market)}</span>
                <span><b>To win</b> {money(b.to_win)}</span>
                <span><b>Fair @ bet</b> {b.fair_p_at_bet === null ? '—' : `${(b.fair_p_at_bet * 100).toFixed(1)}%`}</span>
                <span><b>EV @ bet</b> {pct(b.ev_pct_at_bet)}</span>
                <span><b>Kelly</b> {b.kelly_fraction_used ?? '—'}</span>
                <span><b>Trigger</b> {b.trigger}</span>
                <span><b>Closing</b> {b.closing_line === null ? '—' : fmtLine(b.closing_line, b.market)} {b.closing_price === null ? '' : american(b.closing_price)}</span>
              </div>
              {b.note && <div className="bet-note">“{b.note}”</div>}
              <div className="bet-detail-actions">
                {RESULTS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`btn btn-sm${b.result === r ? ' btn-primary' : ''}`}
                    onClick={() => onGrade(b, r)}
                  >
                    {r}
                  </button>
                ))}
                <button type="button" className="btn btn-sm" onClick={() => onGrade(b, null)}>reopen</button>
                <button type="button" className="btn btn-sm" onClick={() => onNote(b)}>note</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(b)}>delete</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
