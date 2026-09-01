"""Empirical NFL margin model — the key-number engine.

NFL final margins cluster on 3, 7, 6, 10, 4, 14... so a half point is worth
very different amounts at different numbers. Rather than a normal curve we use
the historical distribution of (closing spread, final margin) pairs.

Conventions (match nflverse): `mu` is the expected HOME margin (positive =
home favoured). A betting spread of home -7 is mu = +7. `result` = home - away.

Two estimators:
- kernel: weight historical games by a Gaussian kernel on |mu_i - mu|. Keeps
  the key-number structure exactly (the margin lands on 3 with the real
  frequency for games priced near 3).
- shifted residual: margin = round(mu + r), r drawn from the pooled residual
  distribution. Fallback when few games exist near mu (extreme spreads).

The model is used for *relative* pricing (what is -7.5 worth given -7 is
priced at X), so any absolute bias in historical closing lines mostly cancels.
Totals use the shifted-residual model only; key numbers matter little there.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd


class MarginModel:
    def __init__(self, games: pd.DataFrame, bandwidth: float = 2.0, min_effective_n: float = 150.0):
        g = games.dropna(subset=["spread_line", "result"]).copy()
        if "game_type" in g.columns:
            g = g[g["game_type"] == "REG"]
        self.bw = float(bandwidth)
        self.min_eff = float(min_effective_n)
        self._mu = g["spread_line"].astype(float).to_numpy()
        self._m = g["result"].astype(int).to_numpy()
        self._resid = self._m - self._mu
        self.n = len(self._m)
        if self.n == 0:
            raise ValueError("no games with spread_line and result")
        self._pmf_cache: dict[float, tuple[np.ndarray, np.ndarray]] = {}

    # ---- distributions ----------------------------------------------------
    def _raw_pmf(self, mu: float) -> tuple[np.ndarray, np.ndarray]:
        """Kernel-weighted historical margin distribution for games priced near mu."""
        d = (self._mu - mu) / self.bw
        w = np.exp(-0.5 * d * d)
        tot = w.sum()
        eff = tot * tot / (w * w).sum() if tot > 0 else 0.0
        if eff >= self.min_eff:
            ks, inv = np.unique(self._m, return_inverse=True)
            probs = np.bincount(inv, weights=w) / tot
        else:
            shifted = np.floor(mu + self._resid + 0.5).astype(int)
            ks, counts = np.unique(shifted, return_counts=True)
            probs = counts / counts.sum()
        return ks, probs

    @staticmethod
    def _median(ks: np.ndarray, probs: np.ndarray) -> float:
        """Continuous median treating mass at k as spread over [k-.5, k+.5]."""
        cdf = np.cumsum(probs)
        i = int(np.searchsorted(cdf, 0.5))
        prev = cdf[i - 1] if i > 0 else 0.0
        frac = (0.5 - prev) / max(1e-12, probs[i])
        return float(ks[i] - 0.5 + frac)

    def _pmf(self, mu: float) -> tuple[np.ndarray, np.ndarray]:
        """(margins, probs) for P(home margin = k | mu).

        The kernel is centred on the historical spread s whose empirical margin
        distribution has median mu (found by bisection), so the result is a true
        historical distribution — key-number masses intact — whose location is
        dictated by the sharp price rather than by any bias in old closing lines."""
        key = round(float(mu), 2)
        hit = self._pmf_cache.get(key)
        if hit is not None:
            return hit
        lo, hi = key - 8.0, key + 8.0
        ks = probs = None
        for _ in range(30):
            mid = (lo + hi) / 2
            ks, probs = self._raw_pmf(mid)
            med = self._median(ks, probs)
            if abs(med - key) < 0.01:
                break
            if med < key:
                lo = mid
            else:
                hi = mid
        if len(self._pmf_cache) > 4096:
            self._pmf_cache.clear()
        self._pmf_cache[key] = (ks, probs)
        return ks, probs

    def margin_pmf(self, mu: float) -> dict[int, float]:
        ks, probs = self._pmf(mu)
        return {int(k): float(p) for k, p in zip(ks, probs)}

    # ---- cover probabilities -----------------------------------------------
    def cover_probs(self, mu: float, home_spread: float) -> tuple[float, float, float]:
        """Home team laying `home_spread` (e.g. -7.0 means home -7).
        Returns (p_home_cover, p_push, p_away_cover)."""
        line = -float(home_spread)  # home covers if margin > line
        ks, probs = self._pmf(mu)
        p_win = float(probs[ks > line].sum())
        p_push = float(probs[ks == line].sum()) if float(line).is_integer() else 0.0
        return p_win, p_push, max(0.0, 1.0 - p_win - p_push)

    def p_cover_no_push(self, mu: float, home_spread: float, side: str = "home") -> float:
        """Probability the bet wins, conditional on not pushing (pushes refund)."""
        w, push, l = self.cover_probs(mu, home_spread)
        denom = max(1e-12, 1 - push)
        return (w / denom) if side == "home" else (l / denom)

    def implied_mu(self, home_spread: float, p_home_cover_no_push: float) -> float:
        """Invert: find mu such that P(home covers home_spread | mu) = p. Bisection."""
        lo, hi = -35.0, 35.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if self.p_cover_no_push(mid, home_spread, "home") < p_home_cover_no_push:
                lo = mid
            else:
                hi = mid
        return round((lo + hi) / 2, 2)

    def fair_spread_from(self, home_spread: float, p_home_cover_no_push: float) -> float:
        """The fair spread (betting convention, home perspective) implied by a
        devigged cover probability at a quoted line."""
        return -self.implied_mu(home_spread, p_home_cover_no_push)

    def p_win_ml(self, mu: float, side: str = "home") -> float:
        """Moneyline win probability from the margin model (ties split)."""
        ks, probs = self._pmf(mu)
        p_home = float(probs[ks > 0].sum() + 0.5 * probs[ks == 0].sum())
        return p_home if side == "home" else 1 - p_home

    # ---- research helpers --------------------------------------------------
    def margin_frequencies(self, max_margin: int = 14) -> list[dict]:
        absm = np.abs(self._m)
        return [{"margin": k, "freq": round(float((absm == k).mean()), 4), "n": int((absm == k).sum())} for k in range(0, max_margin + 1)]

    def half_point_values(self, numbers=(1, 2, 3, 4, 6, 7, 10, 14)) -> list[dict]:
        """Change in cover probability from moving a home favourite's line
        from -(k+0.5) to -(k-0.5), priced at mu=k: the value of crossing k."""
        out = []
        for k in numbers:
            on = self.p_cover_no_push(k, -k + 0.5, "home")
            off = self.p_cover_no_push(k, -k - 0.5, "home")
            out.append({"from": k + 0.5, "to": k - 0.5, "delta_p": round(on - off, 4), "p_at_minus": round(off, 4), "p_at_plus": round(on, 4)})
        return out


class TotalModel:
    """Shifted-residual model for game totals: total = round(T + r)."""

    def __init__(self, games: pd.DataFrame):
        g = games.dropna(subset=["total_line", "total"]).copy()
        if "game_type" in g.columns:
            g = g[g["game_type"] == "REG"]
        self._resid = (g["total"].astype(float) - g["total_line"].astype(float)).to_numpy()
        self._resid = self._resid - float(np.median(self._resid))
        self.n = len(self._resid)
        if self.n == 0:
            raise ValueError("no games with total_line and total")

    def _pmf(self, fair_total: float) -> tuple[np.ndarray, np.ndarray]:
        shifted = np.floor(float(fair_total) + self._resid + 0.5).astype(int)
        ks, counts = np.unique(shifted, return_counts=True)
        return ks, counts / counts.sum()

    def probs(self, fair_total: float, line: float) -> tuple[float, float, float]:
        """(p_over, p_push, p_under) for a quoted `line` given the fair total."""
        ks, probs = self._pmf(fair_total)
        line = float(line)
        o = float(probs[ks > line].sum())
        push = float(probs[ks == line].sum()) if line.is_integer() else 0.0
        return o, push, max(0.0, 1 - o - push)

    def p_no_push(self, fair_total: float, line: float, side: str = "over") -> float:
        o, push, u = self.probs(fair_total, line)
        d = max(1e-12, 1 - push)
        return o / d if side == "over" else u / d

    def implied_total(self, line: float, p_over_no_push: float) -> float:
        lo, hi = float(line) - 25, float(line) + 25
        for _ in range(40):
            mid = (lo + hi) / 2
            if self.p_no_push(mid, line, "over") < p_over_no_push:
                lo = mid
            else:
                hi = mid
        return round((lo + hi) / 2, 2)
