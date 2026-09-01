"""Closing Line Value.

clv_prob   = fair probability of our side at the closing sharp line (at OUR line)
             minus the fair probability when we bet. Positive = market moved toward us.
clv_points = for spreads/totals, how many points the closing line moved in our
             favour (home -7 taken, closes -7.5 -> +0.5). None for moneylines.
edge_at_close_pct = EV of the price we took, judged by the closing fair probability.
direction  = toward / against / flat  (flat within +-0.2% probability)
"""
from __future__ import annotations

from .odds import american_to_decimal, ev_pct

FLAT_BAND = 0.002


def clv_points(market: str, side: str, line_taken: float | None, closing_line: float | None) -> float | None:
    if market == "h2h" or line_taken is None or closing_line is None:
        return None
    lt, cl = float(line_taken), float(closing_line)
    if market == "spreads":
        # lines are stored from the bettor's side perspective: home -7 / away +7.
        # A bigger number is always better for the holder: -7 -> -7.5 close means our -7 is +0.5 better.
        return _spread_clv(lt, cl)
    if market == "totals":
        return round(cl - lt, 2) if side == "over" else round(lt - cl, 2)
    return None


def _spread_clv(line_taken: float, closing_line: float) -> float:
    # Both numbers from the same side's perspective. If we took -7 and it closed -7.5,
    # we hold the better number by 0.5. If we took +3 and it closed +2.5, also +0.5.
    return round(line_taken - closing_line, 2)


def clv_direction(clv_prob: float | None) -> str | None:
    if clv_prob is None:
        return None
    if clv_prob > FLAT_BAND:
        return "toward"
    if clv_prob < -FLAT_BAND:
        return "against"
    return "flat"


def compute(
    *,
    market: str,
    side: str,
    line_taken: float | None,
    price_taken_american: float,
    fair_p_at_bet: float | None,
    closing_line: float | None,
    closing_fair_p_at_our_line: float | None,
) -> dict:
    cp = None
    if closing_fair_p_at_our_line is not None and fair_p_at_bet is not None:
        cp = round(closing_fair_p_at_our_line - fair_p_at_bet, 4)
    edge = None
    if closing_fair_p_at_our_line is not None:
        edge = round(ev_pct(closing_fair_p_at_our_line, american_to_decimal(price_taken_american)), 2)
    return {
        "clv_prob": cp,
        "clv_points": clv_points(market, side, line_taken, closing_line),
        "edge_at_close_pct": edge,
        "clv_direction": clv_direction(cp),
    }
