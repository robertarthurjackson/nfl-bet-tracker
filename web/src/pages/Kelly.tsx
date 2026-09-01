import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { money, pct, prob } from '../lib/format'

/* ---------------------------------------------------------------- helpers */

function americanToDecimal(a: number): number | null {
  if (!Number.isFinite(a) || a === 0 || (a > -100 && a < 100)) return null
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a)
}

function kellyFraction(p: number, dec: number): number {
  const b = dec - 1
  return Math.max(0, (b * p - (1 - p)) / b)
}

/* ------------------------------------------------------------------ page */

const TERMS: { id: string; sym: string; name: string }[] = [
  { id: 'term-f', sym: 'f*', name: 'the stake' },
  { id: 'term-b', sym: 'b', name: 'the payout' },
  { id: 'term-p', sym: 'p', name: 'our probability' },
  { id: 'term-q', sym: 'q', name: 'the chance of losing' },
]

export function KellyPage() {
  const [lit, setLit] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setLit(id)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLit(null), 1600)
  }

  const cls = (id: string) => `card kelly-section${lit === id ? ' flash' : ''}`

  return (
    <div className="page kelly-page">
      <header className="page-head">
        <h1>The Kelly formula</h1>
        <p className="prose-note">
          Kelly answers one question: <strong>what fraction of my bankroll maximises long-run growth?</strong>{' '}
          Tap any symbol to see what it means — and where this site gets it from.
        </p>
      </header>

      <div className="card formula-card">
        <div className="formula" role="group" aria-label="Kelly formula; each term is a button">
          <button type="button" className="fterm" onClick={() => jump('term-f')}>f*</button>
          <span className="fop">=</span>
          <span className="ffrac">
            <span className="fnum">
              <button type="button" className="fterm" onClick={() => jump('term-b')}>b</button>
              <span className="fop">·</span>
              <button type="button" className="fterm" onClick={() => jump('term-p')}>p</button>
              <span className="fop">−</span>
              <button type="button" className="fterm" onClick={() => jump('term-q')}>q</button>
            </span>
            <span className="fden">
              <button type="button" className="fterm" onClick={() => jump('term-b')}>b</button>
            </span>
          </span>
        </div>
        <div className="formula-legend">
          {TERMS.map((t) => (
            <button key={t.id} type="button" className="legend-item" onClick={() => jump(t.id)}>
              <span className="legend-sym">{t.sym}</span> {t.name}
            </button>
          ))}
        </div>
      </div>

      <section id="term-f" className={cls('term-f')}>
        <h2 className="card-title"><span className="sym">f*</span> — the stake</h2>
        <div className="prose">
          <p>
            The answer: the <strong>fraction of your bankroll</strong> to put on this bet. When the edge is zero
            or negative, f* is zero — Kelly never says &ldquo;bet a little anyway.&rdquo; That is why most rows on the
            Board show <strong>$0.00</strong>: at most prices, against a fair probability, there is nothing to bet.
          </p>
          <p>
            <strong>On this site</strong> the stake you see is not raw f*. It is f* × the week&rsquo;s Kelly fraction
            (¼ early season → ½ later), × a short-price adjustment, then capped at 3% of bankroll per bet and 10%
            open exposure. See <a href="#fractional">why we never bet full Kelly</a>.
          </p>
        </div>
      </section>

      <section id="term-b" className={cls('term-b')}>
        <h2 className="card-title"><span className="sym">b</span> — the payout</h2>
        <div className="prose">
          <p>
            Net profit per $1 staked: <strong>decimal odds − 1</strong>. At −110 you profit $0.91 per dollar, so
            b = 0.91. At −400, b = 0.25. At +320, b = 3.20. Favourites have small b — you risk a lot to win a
            little — and that is exactly what makes them dangerous inside this formula.
          </p>
          <p>
            <strong>On this site</strong> b comes from <em>the price on the row you are looking at</em> — the
            actual sportsbook quote, not the fair line. Two books offering the same team at −380 and −400 are two
            different bets with two different b&rsquo;s, which is why the same game shows different stakes per book.
          </p>
        </div>
      </section>

      <section id="term-p" className={cls('term-p')}>
        <h2 className="card-title"><span className="sym">p</span> — our probability</h2>
        <div className="prose">
          <p>
            The probability the bet wins. <strong>This is the input everything hinges on</strong> — and the one
            the formula cannot supply. Feed Kelly the market&rsquo;s own implied probability and it answers
            &ldquo;never bet&rdquo;: the vig makes every price slightly worse than the market&rsquo;s true opinion.
          </p>
          <p>
            <strong>On this site</strong> p comes from <strong>Pinnacle</strong>, the sharpest widely-quoted book,
            with the vig stripped out (&ldquo;devigging&rdquo;). Pinnacle takes unlimited action from winning
            bettors, so its line is sharpened by the best-informed money in the market — and its devigged closing
            prices are empirically well calibrated: outcomes it rates 60% happen about 60% of the time. Example:
            Pinnacle quoting −386 / +313 devigs to p ≈ 78.1% for the favourite. That 78.1% is the FAIR column on
            the Board, and it is the p in every stake this site recommends. Never your gut, never the betting
            book&rsquo;s own price — the <Link to="/method">Method page</Link> covers why.
          </p>
        </div>
      </section>

      <section id="term-q" className={cls('term-q')}>
        <h2 className="card-title"><span className="sym">q</span> — the chance of losing</h2>
        <div className="prose">
          <p>
            Simply 1 − p. It is in the formula because a loss costs your whole stake while a win only earns
            b per dollar — Kelly is balancing those two against each other. Rearranged: f* = p − q/b. The q/b term
            is why short prices are punishing: at −400, b = 0.25, so the losing chance gets divided by a small
            number and weighs four times heavier than it would at even money.
          </p>
        </div>
      </section>

      <section id="fractional" className="card kelly-section">
        <h2 className="card-title">Why we never bet full Kelly</h2>
        <div className="prose">
          <p>
            Full Kelly is optimal only if p is <em>exactly</em> right — and p is always an estimate. Overestimate
            your edge and full Kelly overbets, which destroys bankrolls. Betting a fraction c of f* gives
            c(2−c) of the growth with c² of the swings:
          </p>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fraction</th><th className="num">Growth kept</th><th className="num">Variance kept</th></tr></thead>
              <tbody>
                <tr><td>Full Kelly</td><td className="num">100%</td><td className="num">100%</td></tr>
                <tr><td>Half Kelly</td><td className="num">75%</td><td className="num">25%</td></tr>
                <tr><td>Quarter Kelly</td><td className="num">44%</td><td className="num">6%</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>On this site:</strong> quarter Kelly in weeks 1–2 (the market knows least, and so does our
            fair price), one-third in weeks 3–5, half after that. On top of that, short prices get scaled down
            further — at −400, f* = 5p − 4, so every 1-point error in p moves the stake by 5% of bankroll,
            versus 2% at even money. Estimation error is most expensive exactly where bets feel safest.
          </p>
        </div>
      </section>

      <section className="card kelly-section">
        <h2 className="card-title">Try it</h2>
        <Calculator />
      </section>
    </div>
  )
}

/* ----------------------------------------------------------- calculator */

function Calculator() {
  const [price, setPrice] = useState('-400')
  const [pPct, setPPct] = useState('78.1')
  const [bankroll, setBankroll] = useState('5000')

  const out = useMemo(() => {
    const dec = americanToDecimal(Number(price))
    const p = Number(pPct) / 100
    const bank = Number(bankroll)
    if (!dec || !(p > 0 && p < 1) || !(bank > 0)) return null
    const b = dec - 1
    const breakeven = 1 / dec
    const evPct = (p * dec - 1) * 100
    const full = kellyFraction(p, dec)
    return { b, breakeven, evPct, full, bank }
  }, [price, pPct, bankroll])

  return (
    <div className="kelly-calc">
      <div className="calc-inputs">
        <label className="field"><span>Price (American)</span>
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field"><span>Your p (%)</span>
          <input inputMode="decimal" value={pPct} onChange={(e) => setPPct(e.target.value)} />
          <span className="field-help">On the Board this is the FAIR column — devigged Pinnacle.</span>
        </label>
        <label className="field"><span>Bankroll ($)</span>
          <input inputMode="numeric" value={bankroll} onChange={(e) => setBankroll(e.target.value)} />
        </label>
      </div>
      {out === null ? (
        <div className="state state-empty">Enter a price (±100 or beyond), a probability between 0 and 100, and a bankroll.</div>
      ) : (
        <>
          <div className="tiles">
            <div className="tile"><div className="tile-k">b (net odds)</div><div className="tile-v">{out.b.toFixed(3)}</div></div>
            <div className="tile"><div className="tile-k">Break-even p</div><div className="tile-v">{prob(out.breakeven)}</div></div>
            <div className="tile"><div className="tile-k">EV</div><div className={`tile-v ${out.evPct > 0 ? 'pos' : 'neg'}`}>{pct(out.evPct, 2)}</div></div>
            <div className="tile"><div className="tile-k">Full Kelly f*</div><div className="tile-v">{pct(out.full * 100, 2)}</div></div>
          </div>
          {out.full <= 0 ? (
            <p className="calc-verdict">
              <strong>No bet.</strong> Your p ({pPct}%) does not clear the break-even probability
              ({prob(out.breakeven)}) at this price. This is Kelly working, not failing — it only sizes an edge,
              and there is no edge here.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Sizing</th><th className="num">% of bankroll</th><th className="num">Stake</th></tr></thead>
                <tbody>
                  {([['Full Kelly', 1], ['Half', 0.5], ['Third', 1 / 3], ['Quarter (weeks 1–2)', 0.25]] as const).map(([label, c]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="num">{pct(out.full * c * 100, 2)}</td>
                      <td className="num">{money(out.bank * out.full * c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="field-help">
            The Board applies one more step: a short-price scale-down and the 3% / 10% caps — so its stake can be
            smaller than the table above, never larger.
          </p>
        </>
      )}
    </div>
  )
}
