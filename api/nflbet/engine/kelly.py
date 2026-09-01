"""Kelly criterion sizing with fractional Kelly, a short-price sensitivity
adjustment, and hard caps.

Kelly:  f* = (b*p - q) / b = p - q/b
  b = decimal odds - 1 (net profit per unit staked)
  p = our probability of winning, q = 1 - p
  f* = fraction of bankroll to stake (0 if edge <= 0)

Growth with fraction c of full Kelly is c(2-c) of full-Kelly growth, with
c^2 of the variance: half Kelly = 75% growth / 25% variance.

Price sensitivity: df*/dp = 1 + 1/b. At even money that is 2; at -400 it is 5.
The same estimation error in p produces 2.5x the staking error on a -400
favourite. `price_sensitivity_factor` scales the fraction by 2/(1+1/b), capped
at 1, so short prices get sized down in proportion to that sensitivity.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict


def kelly_fraction(p: float, decimal: float) -> float:
    """Full-Kelly fraction of bankroll. 0 when there is no edge."""
    if not 0 < p < 1:
        raise ValueError("p must be in (0,1)")
    b = decimal - 1
    if b <= 0:
        raise ValueError("decimal odds must exceed 1")
    q = 1 - p
    f = (b * p - q) / b
    return max(0.0, f)


def growth_rate(p: float, decimal: float, f: float) -> float:
    """Expected log-growth per bet when staking fraction f."""
    from math import log

    b = decimal - 1
    if f <= 0:
        return 0.0
    if f >= 1:
        return float("-inf")
    return p * log(1 + b * f) + (1 - p) * log(1 - f)


def price_sensitivity_factor(decimal: float) -> float:
    b = decimal - 1
    if b <= 0:
        raise ValueError("decimal odds must exceed 1")
    return min(1.0, 2.0 / (1.0 + 1.0 / b))


def fraction_for_week(schedule: list[dict], week: int, default: float = 0.5) -> float:
    """schedule: [{from_week, to_week, fraction}], inclusive ranges."""
    for row in schedule:
        if int(row["from_week"]) <= week <= int(row["to_week"]):
            return float(row["fraction"])
    return default


@dataclass
class KellyRecommendation:
    full_fraction: float          # f* (0..1)
    fraction_used: float          # the fractional-Kelly multiplier (e.g. 0.25)
    price_adjust: float           # short-price sensitivity factor (<=1)
    recommended_pct: float        # % of bankroll to stake after fraction, adjust, caps
    recommended_stake: float      # dollars
    capped: bool
    cap_reason: str | None

    def to_dict(self) -> dict:
        return asdict(self)


def recommend(
    p: float,
    decimal: float,
    bankroll: float,
    fraction: float,
    *,
    price_sensitivity_adjust: bool = True,
    max_bet_pct: float = 3.0,
    open_exposure: float = 0.0,
    max_open_exposure_pct: float = 10.0,
) -> KellyRecommendation:
    full = kelly_fraction(p, decimal)
    adj = price_sensitivity_factor(decimal) if price_sensitivity_adjust else 1.0
    pct = full * fraction * adj * 100
    capped, reason = False, None
    if pct > max_bet_pct:
        pct, capped, reason = max_bet_pct, True, f"max bet {max_bet_pct:g}% of bankroll"
    room_pct = max(0.0, max_open_exposure_pct - (open_exposure / bankroll * 100 if bankroll else 0))
    if pct > room_pct:
        pct, capped = room_pct, True
        reason = f"open exposure cap {max_open_exposure_pct:g}% (room {room_pct:.1f}%)"
    stake = round(bankroll * pct / 100, 2)
    return KellyRecommendation(
        full_fraction=round(full, 4),
        fraction_used=fraction,
        price_adjust=round(adj, 3),
        recommended_pct=round(pct, 2),
        recommended_stake=stake,
        capped=capped,
        cap_reason=reason,
    )
