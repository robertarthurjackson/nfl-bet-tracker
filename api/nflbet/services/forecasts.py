"""Shadow forecasts: your probability vs the market's, scored, no money."""
from __future__ import annotations

from math import log

from fastapi import HTTPException

from ..core import Core, utcnow
from .bets import settle

MIN_N = 30


def _serialize(core: Core, f: dict) -> dict:
    g = core.game(f["game_id"]) or {}
    return {**f, "home": g.get("home"), "away": g.get("away"), "kickoff": g.get("kickoff"), "week": g.get("week")}


def list_all(core: Core) -> list[dict]:
    return [_serialize(core, f) for f in core.db.q("SELECT * FROM forecasts ORDER BY id DESC")]


def create(core: Core, payload: dict) -> dict:
    from .board import Fair, latest_rows

    g = core.game(payload.get("game_id", ""))
    if not g:
        raise HTTPException(404, "unknown game_id")
    market, side = payload.get("market"), payload.get("side")
    if market not in ("h2h", "spreads", "totals"):
        raise HTTPException(400, "bad market")
    try:
        my_p = float(payload["my_p"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "my_p required")
    if my_p > 1:
        my_p /= 100
    if not 0 < my_p < 1:
        raise HTTPException(400, "my_p must be a probability")
    line = payload.get("line")
    books = {b["key"]: b for b in core.books()}
    fair = Fair(core, g, latest_rows(core, [g["game_id"]]), core.settings, books)
    mp = fair.p(market, side, line)
    with core.db.tx() as c:
        c.execute("INSERT INTO forecasts(created_at,game_id,market,side,line,my_p,market_p_at_time,note) VALUES(?,?,?,?,?,?,?,?)",
                  (utcnow(), g["game_id"], market, side, line, my_p, None if mp is None else round(mp, 4), payload.get("note") or ""))
        fid = c.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    return _serialize(core, core.db.one("SELECT * FROM forecasts WHERE id=?", (fid,)))


def delete(core: Core, fid: int) -> None:
    with core.db.tx() as c:
        c.execute("DELETE FROM forecasts WHERE id=?", (fid,))


def grade_all(core: Core) -> int:
    n = 0
    for f in core.db.q("""SELECT f.* FROM forecasts f JOIN games g ON g.game_id=f.game_id WHERE f.outcome IS NULL AND g.status='final'"""):
        g = core.game(f["game_id"])
        res = settle(f["market"], f["side"], f["line"], g["home_score"], g["away_score"])
        out = {"win": 1, "loss": 0, "push": None}[res]
        if out is None:
            continue
        with core.db.tx() as c:
            c.execute("UPDATE forecasts SET outcome=? WHERE id=?", (out, f["id"]))
        n += 1
    return n


def score(core: Core) -> dict:
    rows = core.db.q("SELECT * FROM forecasts WHERE outcome IS NOT NULL AND market_p_at_time IS NOT NULL")
    n = len(rows)

    def brier(key):
        return round(sum((r[key] - r["outcome"]) ** 2 for r in rows) / n, 4) if n else None

    def ll(key):
        eps = 1e-6
        return round(-sum(r["outcome"] * log(max(eps, r[key])) + (1 - r["outcome"]) * log(max(eps, 1 - r[key])) for r in rows) / n, 4) if n else None

    buckets = []
    for lo in range(0, 100, 10):
        hi = lo + 10
        rs = [r for r in rows if lo <= r["my_p"] * 100 < hi or (hi == 100 and r["my_p"] == 1)]
        if rs:
            buckets.append({"bucket": f"{lo}-{hi}", "n": len(rs),
                            "predicted_mine": round(sum(r["my_p"] for r in rs) / len(rs), 3),
                            "predicted_market": round(sum(r["market_p_at_time"] for r in rs) / len(rs), 3),
                            "actual": round(sum(r["outcome"] for r in rs) / len(rs), 3)})
    bm, bk = brier("my_p"), brier("market_p_at_time")
    verdict = "insufficient" if n < MIN_N else ("mine" if bm < bk else "market")
    return {"n_scored": n, "brier_mine": bm, "brier_market": bk, "log_loss_mine": ll("my_p"), "log_loss_market": ll("market_p_at_time"),
            "calibration": buckets, "verdict": verdict, "min_n": MIN_N}
