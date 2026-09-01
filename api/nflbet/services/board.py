"""Fair prices + market rows for the odds board."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import median

from ..core import Core
from ..data.books import BETTABLE_JURISDICTIONS
from ..engine import devig as devig_mod, kelly as kelly_mod
from ..engine.odds import american_to_decimal, ev_pct, implied_prob

FRESH_HOURS = 36


def latest_rows(core: Core, game_ids: list[str], as_of: str | None = None) -> dict[tuple, dict]:
    """Most recent snapshot row per (game, book, market, side), optionally as of a timestamp."""
    if not game_ids:
        return {}
    ph = ",".join("?" * len(game_ids))
    params: list = list(game_ids)
    where = f"game_id IN ({ph})"
    if as_of:
        where += " AND captured_at<=?"
        params.append(as_of)
    rows = core.db.q(f"""SELECT s.* FROM odds_snapshots s JOIN (
                           SELECT MAX(id) AS id FROM odds_snapshots WHERE {where} GROUP BY game_id, book, market, side
                         ) m ON m.id=s.id""", params)
    return {(r["game_id"], r["book"], r["market"], r["side"]): r for r in rows}


def kelly_fraction_for(settings: dict, week: int) -> float:
    k = settings["kelly"]
    if k["mode"] == "fixed":
        return float(k["fixed_fraction"])
    return kelly_mod.fraction_for_week(k["schedule"], week, default=float(k["fixed_fraction"]))


class Fair:
    """Fair prices for one game, derived from the sharp book (or a consensus)."""

    def __init__(self, core: Core, game: dict, rows: dict[tuple, dict], settings: dict, books: dict[str, dict]):
        self.core, self.game, self.settings = core, game, settings
        self.method = settings["devig_method"]
        gid = game["game_id"]
        sharp = settings["sharp_book"]
        self.source, self.updated_at = None, None
        self.home_ml_p = self.away_ml_p = None
        self.mu = None            # expected home margin
        self.fair_total = None

        def rows_for(book, market):
            return {side: rows.get((gid, book, market, side)) for side in (("over", "under") if market == "totals" else ("home", "away"))}

        def fresh(r):
            if not r:
                return False
            return datetime.fromisoformat(r["captured_at"]) > datetime.now(timezone.utc) - timedelta(hours=FRESH_HOURS)

        # --- 1. sharp book
        used_sharp = False
        for market in ("h2h", "spreads", "totals"):
            rr = rows_for(sharp, market)
            if all(rr.values()) and all(fresh(r) for r in rr.values()):
                self._absorb(market, rr)
                used_sharp = True
                self.updated_at = max(self.updated_at or "", max(r["captured_at"] for r in rr.values()))
        if used_sharp:
            self.source = sharp
        # --- 2. consensus fallback per missing market
        bettable = [k for k, b in books.items() if b["enabled"] and b["jurisdiction"] in BETTABLE_JURISDICTIONS]
        for market in ("h2h", "spreads", "totals"):
            if self._has(market):
                continue
            cons = self._consensus(gid, market, bettable, rows)
            if cons:
                self._absorb(market, cons)
                self.source = self.source or "consensus"
                self.updated_at = self.updated_at or max(r["captured_at"] for r in cons.values())
        # --- 3. derive spread from ML or vice versa when one is missing
        if self.mu is None and self.home_ml_p is not None:
            self.mu = self._mu_from_ml(self.home_ml_p)
        if self.home_ml_p is None and self.mu is not None:
            self.home_ml_p = core.margin_model.p_win_ml(self.mu, "home")
            self.away_ml_p = 1 - self.home_ml_p

    def _has(self, market):
        return {"h2h": self.home_ml_p is not None, "spreads": self.mu is not None, "totals": self.fair_total is not None}[market]

    def _absorb(self, market, rr):
        sides = list(rr.keys())
        q = [implied_prob(rr[s]["price"]) for s in sides]
        p = devig_mod.devig(q, self.method)
        if market == "h2h":
            self.home_ml_p, self.away_ml_p = p[0], p[1]
        elif market == "spreads":
            home_line = rr["home"]["line"]
            if home_line is None:
                return
            self.mu = self.core.margin_model.implied_mu(home_line, p[0])
        else:
            line = rr["over"]["line"]
            if line is None:
                return
            self.fair_total = self.core.total_model.implied_total(line, p[0])

    def _consensus(self, gid, market, books, rows):
        sides = ("over", "under") if market == "totals" else ("home", "away")
        cands = [(rows.get((gid, b, market, sides[0])), rows.get((gid, b, market, sides[1]))) for b in books]
        cands = [c for c in cands if c[0] and c[1]]
        if len(cands) < 2:
            return None
        if market != "h2h":
            # use the modal line so prices are comparable
            from collections import Counter

            line = Counter(c[0]["line"] for c in cands).most_common(1)[0][0]
            cands = [c for c in cands if c[0]["line"] == line]
            if len(cands) < 2:
                return None
        a = median(c[0]["price"] for c in cands)
        b = median(c[1]["price"] for c in cands)
        latest = max(c[0]["captured_at"] for c in cands)
        base = cands[0]
        return {sides[0]: {**base[0], "price": a, "captured_at": latest}, sides[1]: {**base[1], "price": b, "captured_at": latest}}

    def _mu_from_ml(self, p_home):
        mm = self.core.margin_model
        lo, hi = -35.0, 35.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if mm.p_win_ml(mid, "home") < p_home:
                lo = mid
            else:
                hi = mid
        return round((lo + hi) / 2, 2)

    # --- public -------------------------------------------------------------
    @property
    def fair_spread(self):
        return None if self.mu is None else round(-self.mu, 2)

    def p(self, market: str, side: str, line: float | None) -> float | None:
        if market == "h2h":
            return self.home_ml_p if side == "home" else self.away_ml_p
        if market == "spreads":
            if self.mu is None or line is None:
                return None
            home_spread = line if side == "home" else -line
            return self.core.margin_model.p_cover_no_push(self.mu, home_spread, side)
        if market == "totals":
            if self.fair_total is None or line is None:
                return None
            return self.core.total_model.p_no_push(self.fair_total, line, side)
        return None

    def to_dict(self):
        return {"source": self.source, "updated_at": self.updated_at,
                "home_ml_p": _r(self.home_ml_p), "away_ml_p": _r(self.away_ml_p),
                "fair_spread": self.fair_spread, "fair_total": self.fair_total}


def _r(x, n=4):
    return None if x is None else round(float(x), n)


def market_rows(core: Core, game: dict, fair: Fair, rows: dict, settings: dict, books: dict, bankroll: float,
                open_exposure: float, fraction: float, stale_keys: set[tuple] | None = None) -> list[dict]:
    gid = game["game_id"]
    out = []
    k = settings["kelly"]
    for (g, book, market, side), r in rows.items():
        if g != gid or book not in books or not books[book]["enabled"]:
            continue
        dec = american_to_decimal(r["price"])
        fp = fair.p(market, side, r["line"])
        ev = None if fp is None else ev_pct(fp, dec)
        rec = None
        if fp is not None:
            rec = kelly_mod.recommend(fp, dec, bankroll, fraction, price_sensitivity_adjust=bool(k["price_sensitivity_adjust"]),
                                      max_bet_pct=float(k["max_bet_pct"]), open_exposure=open_exposure,
                                      max_open_exposure_pct=float(k["max_open_exposure_pct"])).to_dict()
        out.append({
            "market": market, "side": side, "book": book, "book_name": books[book]["name"], "jurisdiction": books[book]["jurisdiction"],
            "line": r["line"], "price_american": r["price"], "price_decimal": round(dec, 3),
            "implied_p": round(1 / dec, 4), "fair_p": _r(fp), "ev_pct": _r(ev, 2), "kelly": rec,
            "is_best_price": False, "is_stale_candidate": bool(stale_keys and (gid, book, market, side) in stale_keys),
            "last_update": r["last_update"], "captured_at": r["captured_at"],
        })
    # best price = highest EV among bettable books per (market, side)
    best: dict[tuple, dict] = {}
    for row in out:
        if row["jurisdiction"] in BETTABLE_JURISDICTIONS and row["ev_pct"] is not None:
            key = (row["market"], row["side"])
            if key not in best or row["ev_pct"] > best[key]["ev_pct"]:
                best[key] = row
    for row in best.values():
        row["is_best_price"] = True
    order = {"h2h": 0, "spreads": 1, "totals": 2}
    side_order = {"home": 0, "away": 1, "over": 0, "under": 1}
    out.sort(key=lambda r: (order[r["market"]], side_order[r["side"]], -(r["ev_pct"] if r["ev_pct"] is not None else -99)))
    return out


def stale_candidates(core: Core, rows: dict, settings: dict, games: list[dict]) -> set[tuple]:
    """(game, book, market, side) keys where the sharp book moved recently and the
    soft book's price/line still reflects the pre-move state."""
    from .snapshots import sharp_moved

    moved = sharp_moved(core, float(settings.get("stale_move_threshold", 0.01)))
    if not moved:
        return set()
    sharp = settings["sharp_book"]
    keys = set()
    for m in moved:
        srow = rows.get((m["game_id"], sharp, m["market"], m["side"]))
        if not srow:
            continue
        for (g, book, market, side), r in rows.items():
            if g == m["game_id"] and market == m["market"] and side == m["side"] and book != sharp:
                if (r["last_update"] or "") < (srow["last_update"] or "") or r["captured_at"] < srow["captured_at"]:
                    keys.add((g, book, market, side))
    return keys


def build_board(core: Core, week: int | None = None) -> dict:
    from .bets import current_bankroll, open_exposure as open_exp
    from .snapshots import credits_status

    settings = core.settings
    week = week or core.current_week()
    games = core.games(week)
    books = {b["key"]: b for b in core.books()}
    rows = latest_rows(core, [g["game_id"] for g in games])
    bankroll = current_bankroll(core)
    exposure = open_exp(core)
    fraction = kelly_fraction_for(settings, week)
    stale = stale_candidates(core, rows, settings, games)
    out_games = []
    fetched = max((r["captured_at"] for r in rows.values()), default=None)
    for g in games:
        fair = Fair(core, g, rows, settings, books)
        mrows = market_rows(core, g, fair, rows, settings, books, bankroll, exposure, fraction, stale)
        out_games.append({
            "game_id": g["game_id"], "kickoff": g["kickoff"], "week": g["week"], "home": g["home"], "away": g["away"],
            "home_name": g["home_name"], "away_name": g["away_name"], "status": g["status"],
            "home_score": g["home_score"], "away_score": g["away_score"],
            "fair": fair.to_dict(), "markets": mrows,
        })
    return {"season": core.season, "week": week, "fetched_at": fetched, "credits": credits_status(core),
            "kelly_fraction_this_week": fraction, "ev_threshold_pct": settings["ev_threshold_pct"], "games": out_games}


def opportunities(core: Core, min_ev: float | None = None) -> list[dict]:
    board = build_board(core)
    thr = board["ev_threshold_pct"] if min_ev is None else float(min_ev)
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for g in board["games"]:
        if g["kickoff"] <= now:
            continue
        for r in g["markets"]:
            if r["jurisdiction"] in BETTABLE_JURISDICTIONS and r["ev_pct"] is not None and r["ev_pct"] >= thr:
                out.append({**r, "game_id": g["game_id"], "home": g["home"], "away": g["away"], "kickoff": g["kickoff"], "week": g["week"],
                            "trigger": "stale" if r["is_stale_candidate"] else "threshold"})
    out.sort(key=lambda r: -r["ev_pct"])
    return out


def fair_for_game_as_of(core: Core, game: dict, as_of: str) -> tuple[Fair, dict]:
    books = {b["key"]: b for b in core.books()}
    rows = latest_rows(core, [game["game_id"]], as_of=as_of)
    return Fair(core, game, rows, core.settings, books), rows
