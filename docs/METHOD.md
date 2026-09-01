# Method

This app is a decision-support and record-keeping tool. It does not place bets. It answers three questions:

1. **What is the fair probability of this outcome?** — derived from the sharpest book's price, not from opinion.
2. **Is any book I can bet at offering a price better than fair?** — that is the only definition of "value" used here.
3. **How much should I stake?** — fractional Kelly, with hard caps.

Then it keeps score in the way that actually reveals skill: **closing line value**, not win/loss.

---

## 1. Fair probability: the sharp line, devigged

A moneyline of **−400** implies 400/500 = **80%**. The other side at **+320** implies 100/420 = **23.8%**. They sum to **103.8%** — the extra 3.8% is the book's margin (the *vig*). Removing it (*devigging*) gives the market's fair estimate: about **77%** for the favourite.

The app anchors on **Pinnacle**, the sharpest widely quoted book. Pinnacle's closing line is empirically well *calibrated*: outcomes that devig to 60% happen about 60% of the time. Using it as `p` means borrowing the best forecast available for free.

Devig method is configurable (power is the default; multiplicative, additive and Shin are available). For spreads and totals, the sharp price at the sharp line is converted into a fair *number* (e.g. Pinnacle −7 at −118 ⇒ fair spread ≈ −7.4), and every other book's line is then priced off the historical NFL margin distribution — which is how a half point on or off **3** or **7** is valued correctly.

The soft books' disagreement with the sharp line is the opportunity, not extra information. We do not average the books.

## 2. Value = your probability beats the break-even probability

Break-even probability at decimal odds `d` is `1/d`. A bet is +EV only when `p > 1/d`:

```
EV (per unit staked) = p × d − 1
```

The board shows EV% for every book/market/side. Bets below the EV threshold (default 2%) are dimmed: below that, the error in the devig estimate is larger than the edge.

## 3. Sizing: the Kelly criterion

Kelly answers "what fraction of my bankroll maximises long-run growth?"

```
f* = (b·p − q) / b  =  p − q/b

  b  = decimal odds − 1   (net profit per $1 staked)
  p  = probability of winning
  q  = 1 − p
  f* = fraction of bankroll to stake   (0 if the edge is zero or negative)
```

**Example.** JAX −400 ⇒ b = 0.25. If the true p were 82%: f* = (0.25 × 0.82 − 0.18) / 0.25 = **10%** of bankroll. If p is the market's own 77%: f* = (0.1925 − 0.23) / 0.25 < 0 ⇒ **no bet**.

Two properties that matter:

- **Kelly cannot size a bet from the price alone.** If `p` is taken from the same price, the vig makes f* negative every time. Kelly only produces a stake when `p` comes from somewhere better than the price you are paying — here, the devigged sharp line.
- **Kelly is steep on short prices.** Rearranged, `f* = p(1 + 1/b) − 1/b`. At −400 that is `f* = 5p − 4`: every 1 point of probability error moves the stake by 5% of bankroll. At even money it is 2%. Heavy favourites are where estimation error is most expensive.

**Fractional Kelly.** Betting a fraction `c` of f* gives `c(2 − c)` of the full-Kelly growth rate with `c²` of the variance. Half Kelly: 75% of the growth, 25% of the variance. Quarter Kelly: 44% of the growth, 6% of the variance. Since every `p` is an estimate, full Kelly is never used.

Defaults in this app:

| | |
|---|---|
| Weeks 1–2 | ¼ Kelly (market has the least information; so do we) |
| Weeks 3–5 | ⅓ Kelly |
| Week 6 on | ½ Kelly |
| Short-price adjustment | stake × 2/(1 + 1/b), capped at 1 — sizes down in proportion to the sensitivity above (×0.4 at −400) |
| Max single bet | 3% of bankroll |
| Max open exposure | 10% of bankroll across all unsettled bets |

## 4. Keeping score: closing line value (CLV)

A 2–3% edge is invisible in win/loss for hundreds of bets: an 80% favourite going 8–2 is exactly what the market predicted. What *is* visible quickly is whether the market moved toward your bet after you placed it. If you keep beating the closing line, you are winning in expectation regardless of the last ten results.

For every bet the app records the sharp closing line and price, computes:

- **CLV (probability)** — fair probability of your side at close, at your line, minus fair probability when you bet;
- **CLV (points)** — half points gained or lost against the closing number;
- **direction** — toward / against / flat;

and aggregates by book and by trigger. That aggregate distinguishes **stale** lines (the book was slow and then caught up — positive CLV) from **shaded** lines (the book was deliberately off-market and never moved — flat or negative CLV). No single bet can tell you which; twenty can.

| CLV | W/L | Reading |
|---|---|---|
| positive | poor | variance — change nothing |
| positive | good | working |
| negative | good | luck — the dangerous one |
| negative | poor | process problem |

## 5. Your judgment

Subjective probabilities are how most bettors lose, so money never follows them here. Judgment enters in two controlled ways:

- **Veto, never boost.** You can skip or shrink a bet the numbers like. You cannot enlarge one or create one.
- **Shadow forecasts.** Log your own probability on any game — no money. The app scores it against the market (Brier score, log loss, calibration) and issues a verdict after 30+ forecasts. If your numbers beat the market's, that is evidence; until then it is a hypothesis.

## 6. Is this proven? Yes — the constraint is access, not edge

This is not a new idea. **Kaunitz, Zhong & Kreiner (2017), *Beating the bookies with their own numbers — and how the online sports betting market is rigged*** ([arXiv:1710.02824](https://arxiv.org/abs/1710.02824)) built exactly this system for soccer: derive fair odds from the market consensus, bet the books whose prices deviate.

- Paper trading over ten seasons: ~**3.5%** return on ~56,000 bets.
- Live money: **265 bets over five months, +8.5%** (6.2% combined with the paper-trading period).
- Then every account was **limited or subjected to manual review**, and the experiment ended. The title's "rigged" refers to that, not to the odds.

Since US legalisation an entire product category (OddsJam, Unabated and others) sells the same method. Users report the same arc: it works, and the books restrict them. Pinnacle, by contrast, welcomes winners and publicly endorses CLV as the measure of skill.

So the empirical record says: **the edge is real and modest (1–4% per bet); the binding constraint is how long the books let you keep betting.** Low volume looks less like a threat than high volume. Expect the P&L to be dominated by variance within a single season; expect CLV to tell the truth within a few dozen bets.

## 7. Practical constraints for Alberta / BC

- AGLC-licensed books (bet365, FanDuel, DraftKings, BetMGM, Caesars, BetRivers, theScore, PointsBet, Betway, …) geolocate every wager: you must be **physically in Alberta** to bet.
- BC has one legal book, **PlayNow**, restricted to BC residents physically in BC.
- Pinnacle is not licensed in Alberta; it is used here as the price reference only.
- Public money piles onto favourites and overs late in the week, so favourites usually price better **Thursday/Friday** than Sunday; underdogs the reverse. Betting from Calgary before the weekend is not just a constraint — for favourites it is usually the better price.
