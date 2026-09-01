"""Remove the bookmaker's margin (vig) from a set of implied probabilities.

Input: implied probabilities for all outcomes of one market (they sum to > 1).
Output: fair probabilities that sum to 1.

Methods
- multiplicative: divide by the sum. Simple; slightly over-corrects longshots.
- additive: subtract the overround equally. Can go negative on longshots.
- power: p_i = q_i ** k with k chosen so the p_i sum to 1. Best general-purpose
  method for two-way markets; corrects for the favorite-longshot bias by
  taking more margin from the longshot side. Default.
- shin: Shin (1993) insider-trading model; p_i solved from z (share of insiders).
"""
from __future__ import annotations

from math import sqrt
from typing import Sequence

METHODS = ("power", "multiplicative", "additive", "shin")


def _check(q: Sequence[float]) -> list[float]:
    q = [float(x) for x in q]
    if len(q) < 2:
        raise ValueError("need at least two outcomes")
    if any(x <= 0 or x >= 1 for x in q):
        raise ValueError("implied probabilities must be in (0,1)")
    return q


def overround(q: Sequence[float]) -> float:
    """Total implied probability minus 1 (e.g. 0.038 = 3.8% vig)."""
    return sum(_check(q)) - 1


def multiplicative(q: Sequence[float]) -> list[float]:
    q = _check(q)
    s = sum(q)
    return [x / s for x in q]


def additive(q: Sequence[float]) -> list[float]:
    q = _check(q)
    o = (sum(q) - 1) / len(q)
    p = [x - o for x in q]
    if any(x <= 0 for x in p):
        return multiplicative(q)  # fall back rather than return negatives
    return p


def power(q: Sequence[float], tol: float = 1e-10) -> list[float]:
    q = _check(q)
    lo, hi = 1.0, 20.0  # sum(q)>1 so k>1 shrinks probabilities
    if sum(q) <= 1:
        return multiplicative(q)
    for _ in range(200):
        k = (lo + hi) / 2
        s = sum(x ** k for x in q)
        if abs(s - 1) < tol:
            break
        if s > 1:
            lo = k
        else:
            hi = k
    p = [x ** k for x in q]
    s = sum(p)
    return [x / s for x in p]


def shin(q: Sequence[float], tol: float = 1e-10) -> list[float]:
    """Shin's method. Solves for z (insider fraction) such that fair probs sum to 1.
    p_i = (sqrt(z^2 + 4(1-z) q_i^2 / s) - z) / (2(1-z)),  s = sum(q)."""
    q = _check(q)
    s = sum(q)
    if s <= 1:
        return multiplicative(q)

    def probs(z: float) -> list[float]:
        return [(sqrt(z * z + 4 * (1 - z) * (x * x) / s) - z) / (2 * (1 - z)) for x in q]

    lo, hi = 0.0, 0.5
    for _ in range(200):
        z = (lo + hi) / 2
        tot = sum(probs(z))
        if abs(tot - 1) < tol:
            break
        if tot > 1:
            lo = z
        else:
            hi = z
    p = probs(z)
    tot = sum(p)
    return [x / tot for x in p]


def devig(q: Sequence[float], method: str = "power") -> list[float]:
    if method not in METHODS:
        raise ValueError(f"unknown devig method {method!r}; choose from {METHODS}")
    return {"power": power, "multiplicative": multiplicative, "additive": additive, "shin": shin}[method](q)


def devig_two_way_american(price_a: float, price_b: float, method: str = "power") -> tuple[float, float]:
    """Convenience: fair probabilities for a two-way market quoted in American odds."""
    from .odds import implied_prob

    p = devig([implied_prob(price_a), implied_prob(price_b)], method)
    return p[0], p[1]
