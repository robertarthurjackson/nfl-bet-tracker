import { useState } from 'react'
import { api } from '../api'
import type { Bankroll } from '../api/types'
import { AsyncSection } from '../components/States'
import { LineChart } from '../components/LineChart'
import { useToast } from '../components/Toast'
import { errorMessage, useAsync } from '../lib/useAsync'
import { dateTime, money, moneySigned, pct } from '../lib/format'

export function BankrollPage() {
  const toast = useToast()
  const state = useAsync<Bankroll>(() => api.getBankroll(), [])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function adjust(sign: 1 | -1) {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) { toast.error('Enter a positive amount.'); return }
    setSaving(true)
    try {
      await api.adjustBankroll({ amount: sign * n, note: note || (sign > 0 ? 'deposit' : 'withdrawal') })
      toast.success(`${sign > 0 ? 'Deposited' : 'Withdrew'} ${money(n)}`)
      setAmount('')
      setNote('')
      state.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title-row">
          <h1>Bankroll</h1>
          <button type="button" className="btn btn-sm" onClick={state.reload}>Refresh</button>
        </div>
      </header>

      <AsyncSection state={state}>
        {(b) => (
          <>
            <div className="tiles">
              <Tile k="Balance" v={money(b.current)} tone={b.current >= b.starting ? 'pos' : 'neg'} />
              <Tile k="Starting" v={money(b.starting)} />
              <Tile k="Net" v={moneySigned(b.current - b.starting)} tone={b.current >= b.starting ? 'pos' : 'neg'} />
              <Tile k="Open exposure" v={money(b.open_exposure)} sub={`${b.open_exposure_pct.toFixed(1)}% of bankroll`} />
            </div>

            <section className="card">
              <h2 className="card-title">Balance history</h2>
              <LineChart points={b.history.map((h) => ({ at: h.at, balance: h.balance }))} startLine={b.starting} />
            </section>

            <div className="two-col">
              <section className="card">
                <h2 className="card-title">Summary</h2>
                <dl className="kv">
                  <div><dt>Bets settled</dt><dd>{b.summary.n_bets}</dd></div>
                  <div><dt>Record</dt><dd>{b.summary.wins}-{b.summary.losses}-{b.summary.pushes}</dd></div>
                  <div><dt>Staked</dt><dd>{money(b.summary.staked)}</dd></div>
                  <div><dt>Profit</dt><dd className={b.summary.profit >= 0 ? 'pos' : 'neg'}>{moneySigned(b.summary.profit)}</dd></div>
                  <div><dt>ROI</dt><dd className={b.summary.roi_pct >= 0 ? 'pos' : 'neg'}>{pct(b.summary.roi_pct)}</dd></div>
                </dl>
              </section>

              <section className="card">
                <h2 className="card-title">Deposit / withdraw</h2>
                <div className="form-grid">
                  <label className="field">
                    <span>Amount</span>
                    <input type="text" inputMode="decimal" value={amount} placeholder="500" onChange={(e) => setAmount(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Note</span>
                    <input type="text" value={note} placeholder="deposit" onChange={(e) => setNote(e.target.value)} />
                  </label>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => adjust(1)}>Deposit</button>
                  <button type="button" className="btn" disabled={saving} onClick={() => adjust(-1)}>Withdraw</button>
                </div>
              </section>
            </div>

            <section className="card">
              <h2 className="card-title">Ledger</h2>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>When</th><th>Event</th><th className="num">Amount</th><th className="num">Balance</th><th className="num">Bet</th></tr>
                  </thead>
                  <tbody>
                    {[...b.history].reverse().map((h, i) => (
                      <tr key={`${h.at}-${i}`}>
                        <td className="nowrap">{dateTime(h.at)}</td>
                        <td>{h.event.replace(/_/g, ' ')}</td>
                        <td className={`num ${h.amount >= 0 ? 'pos' : 'neg'}`}>{h.amount === 0 ? '—' : moneySigned(h.amount)}</td>
                        <td className="num">{money(h.balance)}</td>
                        <td className="num muted">{h.bet_id ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </AsyncSection>
    </div>
  )
}

function Tile({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="tile">
      <div className="tile-k">{k}</div>
      <div className={`tile-v ${tone ?? ''}`}>{v}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  )
}
