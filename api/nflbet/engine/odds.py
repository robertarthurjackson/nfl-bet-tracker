"""Odds conversions. American <-> decimal <-> implied probability."""
from __future__ import annotations


def american_to_decimal(american: float) -> float:
    a = float(american)
    if a == 0:
        raise ValueError("American odds cannot be 0")
    return 1 + a / 100 if a > 0 else 1 + 100 / abs(a)


def decimal_to_american(decimal: float) -> int:
    b = decimal - 1
    if b <= 0:
        raise ValueError("Decimal odds must exceed 1.0")
    return int(round(b * 100)) if b >= 1 else int(round(-100 / b))


def implied_prob(american: float) -> float:
    """Book's implied probability, vig included."""
    return 1 / american_to_decimal(american)


def prob_to_decimal(p: float) -> float:
    if not 0 < p < 1:
        raise ValueError("p must be in (0,1)")
    return 1 / p


def prob_to_american(p: float) -> int:
    return decimal_to_american(prob_to_decimal(p))


def breakeven_prob(decimal: float) -> float:
    """Win probability at which a bet at these odds has zero EV."""
    return 1 / decimal


def ev_pct(p: float, decimal: float) -> float:
    """Expected profit per unit staked, in percent.  EV = p*b - (1-p)  where b = decimal-1."""
    return (p * decimal - 1) * 100
