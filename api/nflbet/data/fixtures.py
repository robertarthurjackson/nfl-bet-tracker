"""Offline fixture generator: builds a realistic multi-book Odds-API-shaped
response from the nflverse consensus lines for the current week, so the app
works end to end without an API key. Deterministic per (week, hour) so the
line history looks alive across snapshots.

Includes deliberate features to exercise the engine:
- Pinnacle at the consensus line with a tight ~2.5% vig
- soft books with wider vig, occasional half-point line differences
- one "stale" soft book per week lagging a Pinnacle move
"""
from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone

from .nflverse import TEAM_NAMES


def _seed(*parts) -> int:
    return int(hashlib.md5("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)


def _ml_from_spread(mu: float) -> tuple[int, int]:
    """Rough spread -> moneyline pair (home, away) at fair-ish odds."""
    import math
    p = 1 / (1 + math.exp(-mu / 5.6))  # logistic on margin; ~0.5 at 0, ~0.79 at 7.5
    p = min(0.95, max(0.05, p))
    def am(q):
        return int(round(-100 * q / (1 - q))) if q >= 0.5 else int(round(100 * (1 - q) / q))
    return am(p), am(1 - p)


def _vig(p_home: float, total_vig: float) -> tuple[int, int]:
    qh, qa = p_home * (1 + total_vig), (1 - p_home) * (1 + total_vig)
    def am(q):
        return int(round(-100 * q / (1 - q))) if q >= 0.5 else int(round(100 * (1 - q) / q))
    return am(qh), am(qa)


def build(games: list[dict], markets: list[str], bookmakers: list[str], now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    hour_bucket = now.strftime("%Y%m%d%H")
    events = []
    for g in games:
        if g.get("nv_spread_line") is None:
            continue
        rng = random.Random(_seed(g["game_id"], hour_bucket))
        # slow drift of the consensus over the week so history has movement
        drift = round(rng.choice([-0.5, 0, 0, 0, 0.5]) * (rng.random() < 0.3), 1)
        mu = g["nv_spread_line"] + drift             # home expected margin
        total = g["nv_total_line"] + rng.choice([-0.5, 0, 0, 0.5]) * (rng.random() < 0.2)
        home_ml, away_ml = (int(g["nv_home_ml"]), int(g["nv_away_ml"])) if g.get("nv_home_ml") else _ml_from_spread(mu)
        # fair ML prob from the nflverse pair (devig multiplicatively)
        def ip(a):
            return 100 / (a + 100) if a > 0 else -a / (-a + 100)
        ph = ip(home_ml) / (ip(home_ml) + ip(away_ml))
        stale_book = rng.choice([b for b in bookmakers if b != "pinnacle"] or ["none"])
        ev = {"id": "fx_" + g["game_id"], "sport_key": "americanfootball_nfl", "sport_title": "NFL",
              "commence_time": g["kickoff"], "home_team": g["home_name"], "away_team": g["away_name"], "bookmakers": []}
        for bk in bookmakers:
            brng = random.Random(_seed(g["game_id"], bk, hour_bucket))
            sharp = bk == "pinnacle"
            vig = 0.025 if sharp else brng.uniform(0.04, 0.065)
            shade = 0.0 if sharp else brng.uniform(-0.02, 0.02)   # book leans one side
            bmu = mu if sharp else mu + brng.choice([0, 0, 0, 0.5, -0.5])
            btotal = total if sharp else total + brng.choice([0, 0, 0.5, -0.5])
            if bk == stale_book and drift != 0:
                bmu = mu - drift  # hasn't followed the move
            mk = []
            if "h2h" in markets:
                h, a = _vig(min(0.97, max(0.03, ph + shade)), vig)
                mk.append({"key": "h2h", "last_update": now.isoformat(), "outcomes": [
                    {"name": g["home_name"], "price": h}, {"name": g["away_name"], "price": a}]})
            if "spreads" in markets:
                # price the spread around 50/50 with a small lean when line is off the number
                lean = 0.5 + (mu - bmu) * 0.03 + shade
                h, a = _vig(min(0.6, max(0.4, lean)), vig)
                mk.append({"key": "spreads", "last_update": now.isoformat(), "outcomes": [
                    {"name": g["home_name"], "price": h, "point": -bmu}, {"name": g["away_name"], "price": a, "point": bmu}]})
            if "totals" in markets:
                lean = 0.5 + (total - btotal) * 0.03 + shade * 0.5
                o, u = _vig(min(0.6, max(0.4, lean)), vig)
                mk.append({"key": "totals", "last_update": now.isoformat(), "outcomes": [
                    {"name": "Over", "price": o, "point": btotal}, {"name": "Under", "price": u, "point": btotal}]})
            ev["bookmakers"].append({"key": bk, "title": bk.title(), "last_update": now.isoformat(), "markets": mk})
        events.append(ev)
    return events
