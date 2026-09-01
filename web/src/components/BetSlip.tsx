import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Market, Side, Trigger } from '../api/types'
import { useToast } from './Toast'
import { errorMessage } from '../lib/useAsync'
import { american, decimalFromAmerican, money, MARKET_LABEL, pct, prob, sideLabel } from '../lib/format'

/** Everything a MarketRow (board or opportunity) contributes to a new bet. */
export interface BetSlipSeed {
  game_id: string
  home: string
  away: string
  market: Market
  side: Side
  line: number | null
  book: string
  book_name: string
  price_american: number
  fair_p: number | null
  ev_pct: number | null
  kelly_fraction_used: number | null
  recommended_stake: number
  trigger: Trigger
}

export function BetSlip({
  seed, onClose, onLogged,
}: {
  seed: BetSlipSeed
  onClose: () => void
  onLogged: () => void
}) {
  const toast = useToast()
  const [stake, setStake] = useState(String(seed.recommended_stake ?? 0))
  const [price, setPrice] = useState(String(seed.price_american))
  const [lineValue, setLineValue] = useState(seed.line === null ? '' : String(seed.line))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stakeNum = Number(stake)
  const priceNum = Number(price)
  const validStake = Number.isFinite(stakeNum) && stakeNum > 0
  const validPrice = Number.isFinite(priceNum) && Math.abs(priceNum) >= 100
  const toWin = validStake && validPrice ? stakeNum * (decimalFromAmerican(priceNum) - 1) : null

  async function submit() {
    if (!validStake) { toast.error('Stake must be greater than zero.'); return }
    if (!validPrice) { toast.error('American price must be ≤ -100 or ≥ +100.'); return }
    setSaving(true)
    try {
      await api.createBet({
        game_id: seed.game_id,
        book: seed.book,
        market: seed.market,
        side: seed.side,
        line: lineValue === '' ? null : Number(lineValue),
        price_american: priceNum,
        stake: stakeNum,
        fair_p_at_bet: seed.fair_p,
        ev_pct_at_bet: seed.ev_pct,
        kelly_fraction_used: seed.kelly_fraction_used,
        trigger: seed.trigger,
        note,
      })
      toast.success(`Logged ${money(stakeNum)} on ${sideLabel(seed.market, seed.side, seed.home, seed.away, lineValue === '' ? null : Number(lineValue))}`)
      onLogged()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="Log bet">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">Log bet</div>
            <div className="drawer-sub">{seed.away} @ {seed.home}</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="slip-summary">
          <div><span className="k">Book</span><span className="v">{seed.book_name}</span></div>
          <div><span className="k">Market</span><span className="v">{MARKET_LABEL[seed.market]}</span></div>
          <div><span className="k">Side</span><span className="v">{sideLabel(seed.market, seed.side, seed.home, seed.away, seed.line)}</span></div>
          <div><span className="k">Fair</span><span className="v">{prob(seed.fair_p)}</span></div>
          <div><span className="k">EV</span><span className={`v ${(seed.ev_pct ?? 0) > 0 ? 'pos' : 'neg'}`}>{pct(seed.ev_pct)}</span></div>
          <div><span className="k">Kelly ×</span><span className="v">{seed.kelly_fraction_used ?? '—'}</span></div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Line</span>
            <input
              type="text" inputMode="decimal" value={lineValue}
              placeholder={seed.market === 'h2h' ? 'n/a' : '0.0'}
              disabled={seed.market === 'h2h'}
              onChange={(e) => setLineValue(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Price (American)</span>
            <input type="text" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="field">
            <span>Stake</span>
            <input type="text" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
          </label>
          <div className="field">
            <span>To win</span>
            <div className="field-static">{toWin === null ? '—' : money(toWin)}</div>
          </div>
          <label className="field field-wide">
            <span>Note</span>
            <input type="text" value={note} placeholder="why this bet" onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        <div className="slip-recs">
          Recommended {money(seed.recommended_stake)} at {american(seed.price_american)}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStake(String(seed.recommended_stake))}>
            reset
          </button>
        </div>

        <div className="drawer-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Logging…' : 'Log bet'}
          </button>
        </div>
      </div>
    </>
  )
}
