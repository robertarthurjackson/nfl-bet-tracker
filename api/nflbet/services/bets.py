"""Bet logging, grading, bankroll ledger, closing lines and CLV."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from ..core import Core, utcnow
from ..engine import clv as clv_mod
from ..engine.odds import american_to_decimal, implied_prob

MARKETS = ("h2h", "spreads", "totals")


def settle(market: str, side: str, line: float | None, home_score: int, away_score: int) -> str:
    margin = home_score - away_score
    if market == "h2h":
        if margin == 0:
            return "push"
        return "win" if (margin > 0) == (side == "home") else "loss"
    if market == "spreads":
        adj = margin + float(line) if side == "home" else -margin + float(line)
        return "push" if adj == 0 else ("win" if adj > 0 else "loss")
    if market == "totals":
        t = home_score + away_score
        if t == float(line):
            return "push"
        return "win" if (t > float(line)) == (side == "over") else "loss"
    raise ValueError(market)


def ensure_ledger(core: Core) -> None:
    if not core.db.one("SELECT id FROM ledger LIMIT 1"):
        start = float(core.settings["bankroll_starting"])
        with core.db.tx() as c:
            c.execute("INSERT INTO ledger(at,event,amount,balance,note) VALUES(?,?,?,?,?)", (utcnow(), "start", 0, start, "starting bankroll"))


def current_bankroll(core: Core) -> float:
    ensure_ledger(core)
    return float(core.db.one("SELECT balance FROM ledger ORDER BY id DESC LIMIT 1")["balance"])


def open_exposure(core: Core) -> float:
    return float(core.db.one("SELECT COALESCE(SUM(stake),0) AS s FROM bets WHERE result IS NULL")["s"])


def _ledger(c, event: str, amount: float, bet_id: int | None = None, note: str = "") -> float:
    bal = float(c.execute("SELECT balance FROM ledger ORDER BY id DESC LIMIT 1").fetchone()["balance"])
    bal = round(bal + amount, 2)
    c.execute("INSERT INTO ledger(at,event,amount,balance,bet_id,note) VALUES(?,?,?,?,?,?)", (utcnow(), event, amount, bal, bet_id, note))
    return bal


def adjust(core: Core, amount: float, note: str) -> dict:
    ensure_ledger(core)
    with core.db.tx() as c:
        _ledger(c, "deposit" if amount >= 0 else "withdrawal", float(amount), note=note)
    return bankroll(core)


def serialize(core: Core, b: dict, names: dict[str, str] | None = None) -> dict:
    names = names or core.book_names()
    g = core.game(b["game_id"]) or {}
    dec = american_to_decimal(b["price_american"])
    return {
        "id": b["id"], "placed_at": b["placed_at"], "game_id": b["game_id"], "home": g.get("home"), "away": g.get("away"),
        "kickoff": g.get("kickoff"), "week": g.get("week"), "book": b["book"], "book_name": names.get(b["book"], b["book"]),
        "market": b["market"], "side": b["side"], "line": b["line"], "price_american": b["price_american"],
        "price_decimal": round(dec, 3), "stake": b["stake"], "to_win": round(b["stake"] * (dec - 1), 2),
        "fair_p_at_bet": b["fair_p_at_bet"], "ev_pct_at_bet": b["ev_pct_at_bet"], "kelly_fraction_used": b["kelly_fraction_used"],
        "trigger": b["trigger"], "note": b["note"] or "", "result": b["result"], "profit": b["profit"], "settled_at": b["settled_at"],
        "closing_line": b["closing_line"], "closing_price": b["closing_price"], "closing_fair_p": b["closing_fair_p"],
        "clv_points": b["clv_points"], "clv_prob": b["clv_prob"], "clv_direction": b["clv_direction"],
        "edge_at_close_pct": b["edge_at_close_pct"], "book_closing_line": b["book_closing_line"],
        "book_closing_price": b["book_closing_price"],
        "book_moved_toward": None if b["book_moved_toward"] is None else bool(b["book_moved_toward"]),
    }


def list_bets(core: Core) -> list[dict]:
    names = core.book_names()
    return [serialize(core, b, names) for b in core.db.q("SELECT * FROM bets ORDER BY id DESC")]


def create(core: Core, payload: dict) -> dict:
    g = core.game(payload.get("game_id", ""))
    if not g:
        raise HTTPException(404, "unknown game_id")
    market, side = payload.get("market"), payload.get("side")
    if market not in MARKETS:
        raise HTTPException(400, "market must be h2h|spreads|totals")
    valid_sides = ("over", "under") if market == "totals" else ("home", "away")
    if side not in valid_sides:
        raise HTTPException(400, f"side must be one of {valid_sides}")
    line = payload.get("line")
    if market != "h2h" and line is None:
        raise HTTPException(400, "line required for spreads/totals")
    try:
        price = int(payload["price_american"])
        stake = float(payload["stake"])
        american_to_decimal(price)
    except (KeyError, ValueError, TypeError):
        raise HTTPException(400, "price_american and stake required")
    if stake <= 0:
        raise HTTPException(400, "stake must be positive")
    ensure_ledger(core)
    with core.db.tx() as c:
        c.execute("""INSERT INTO bets(placed_at,game_id,book,market,side,line,price_american,stake,fair_p_at_bet,ev_pct_at_bet,
                     kelly_fraction_used,trigger,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (utcnow(), g["game_id"], payload.get("book", "unknown"), market, side, line, price, stake,
                   payload.get("fair_p_at_bet"), payload.get("ev_pct_at_bet"), payload.get("kelly_fraction_used"),
                   payload.get("trigger") or "manual", payload.get("note") or ""))
        bid = c.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    return serialize(core, core.db.one("SELECT * FROM bets WHERE id=?", (bid,)))


def update(core: Core, bet_id: int, payload: dict) -> dict:
    b = core.db.one("SELECT * FROM bets WHERE id=?", (bet_id,))
    if not b:
        raise HTTPException(404, "no such bet")
    with core.db.tx() as c:
        if "note" in payload:
            c.execute("UPDATE bets SET note=? WHERE id=?", (payload["note"] or "", bet_id))
        if "stake" in payload and b["result"] is None:
            c.execute("UPDATE bets SET stake=? WHERE id=?", (float(payload["stake"]), bet_id))
        if "result" in payload:
            _apply_result(c, core.db.one("SELECT * FROM bets WHERE id=?", (bet_id,)), payload["result"], manual=True)
    return serialize(core, core.db.one("SELECT * FROM bets WHERE id=?", (bet_id,)))


def delete(core: Core, bet_id: int) -> None:
    b = core.db.one("SELECT * FROM bets WHERE id=?", (bet_id,))
    if not b:
        raise HTTPException(404, "no such bet")
    with core.db.tx() as c:
        if b["result"] is not None and b["profit"]:
            _ledger(c, "bet_deleted", -float(b["profit"]), bet_id, "reversal on delete")
        c.execute("DELETE FROM bets WHERE id=?", (bet_id,))


def _apply_result(c, b: dict, result: str | None, manual: bool = False) -> None:
    if result not in (None, "win", "loss", "push", "void"):
        raise HTTPException(400, "result must be win|loss|push|void|null")
    # reverse any prior settlement
    if b["result"] is not None and b["profit"]:
        _ledger(c, "bet_regraded", -float(b["profit"]), b["id"], "reversal")
    if result is None:
        c.execute("UPDATE bets SET result=NULL, profit=NULL, settled_at=NULL WHERE id=?", (b["id"],))
        return
    dec = american_to_decimal(b["price_american"])
    profit = {"win": round(b["stake"] * (dec - 1), 2), "loss": -float(b["stake"]), "push": 0.0, "void": 0.0}[result]
    c.execute("UPDATE bets SET result=?, profit=?, settled_at=? WHERE id=?", (result, profit, utcnow(), b["id"]))
    if profit:
        _ledger(c, "bet_settled", profit, b["id"], f"{'manual ' if manual else ''}{result}")


def grade_all(core: Core) -> int:
    n = 0
    ensure_ledger(core)
    for b in core.db.q("""SELECT b.* FROM bets b JOIN games g ON g.game_id=b.game_id
                           WHERE b.result IS NULL AND g.status='final'"""):
        g = core.game(b["game_id"])
        res = settle(b["market"], b["side"], b["line"], g["home_score"], g["away_score"])
        with core.db.tx() as c:
            _apply_result(c, b, res)
        n += 1
    return n


def fill_closing_lines(core: Core) -> int:
    """For bets whose game has kicked off, record the sharp closing line/price/fair prob
    and the bet's own book's closing line; compute CLV."""
    from .board import fair_for_game_as_of

    now = datetime.now(timezone.utc).isoformat()
    sharp = core.settings["sharp_book"]
    n = 0
    for b in core.db.q("""SELECT b.* FROM bets b JOIN games g ON g.game_id=b.game_id
                           WHERE b.closing_fair_p IS NULL AND g.kickoff<=?""", (now,)):
        g = core.game(b["game_id"])
        fair, rows = fair_for_game_as_of(core, g, g["kickoff"])
        if fair.source is None:
            continue
        closing_fair_p = fair.p(b["market"], b["side"], b["line"])
        srow = rows.get((g["game_id"], sharp, b["market"], b["side"]))
        brow = rows.get((g["game_id"], b["book"], b["market"], b["side"]))
        clv = clv_mod.compute(market=b["market"], side=b["side"], line_taken=b["line"], price_taken_american=b["price_american"],
                              fair_p_at_bet=b["fair_p_at_bet"], closing_line=srow["line"] if srow else None,
                              closing_fair_p_at_our_line=closing_fair_p)
        moved = None
        if brow:
            if b["market"] != "h2h" and brow["line"] is not None and brow["line"] != b["line"]:
                if b["market"] == "spreads":
                    moved = brow["line"] < b["line"]
                else:
                    moved = (brow["line"] > b["line"]) if b["side"] == "over" else (brow["line"] < b["line"])
            else:
                moved = implied_prob(brow["price"]) > implied_prob(b["price_american"]) + 0.002
        with core.db.tx() as c:
            c.execute("""UPDATE bets SET closing_line=?, closing_price=?, closing_fair_p=?, clv_points=?, clv_prob=?, clv_direction=?,
                         edge_at_close_pct=?, book_closing_line=?, book_closing_price=?, book_moved_toward=? WHERE id=?""",
                      (srow["line"] if srow else None, srow["price"] if srow else None, round(closing_fair_p, 4) if closing_fair_p is not None else None,
                       clv["clv_points"], clv["clv_prob"], clv["clv_direction"], clv["edge_at_close_pct"],
                       brow["line"] if brow else None, brow["price"] if brow else None, None if moved is None else int(moved), b["id"]))
        n += 1
    return n


def bankroll(core: Core) -> dict:
    ensure_ledger(core)
    cur = current_bankroll(core)
    start = float(core.db.one("SELECT balance FROM ledger ORDER BY id ASC LIMIT 1")["balance"])
    s = core.db.one("""SELECT COUNT(*) n, SUM(result='win') w, SUM(result='loss') l, SUM(result='push') p,
                       COALESCE(SUM(CASE WHEN result IN ('win','loss','push') THEN stake END),0) staked,
                       COALESCE(SUM(profit),0) profit FROM bets WHERE result IS NOT NULL""")
    exp = open_exposure(core)
    return {
        "starting": start, "current": cur, "open_exposure": exp, "open_exposure_pct": round(exp / cur * 100, 2) if cur else 0,
        "summary": {"n_bets": s["n"] or 0, "wins": s["w"] or 0, "losses": s["l"] or 0, "pushes": s["p"] or 0,
                    "staked": round(s["staked"], 2), "profit": round(s["profit"], 2),
                    "roi_pct": round(s["profit"] / s["staked"] * 100, 2) if s["staked"] else 0.0},
        "history": core.db.q("SELECT at, balance, event, amount, bet_id, note FROM ledger ORDER BY id"),
    }


def clv_report(core: Core) -> dict:
    names = core.book_names()
    bets = [serialize(core, b, names) for b in core.db.q("SELECT * FROM bets WHERE closing_fair_p IS NOT NULL ORDER BY id DESC")]
    n = len(bets)

    def avg(xs):
        xs = [x for x in xs if x is not None]
        return round(sum(xs) / len(xs), 4) if xs else None

    def share(rows, d):
        return round(sum(1 for r in rows if r["clv_direction"] == d) / len(rows), 3) if rows else 0.0

    summary = {"n_closed": n, "avg_clv_prob": avg(b["clv_prob"] for b in bets), "avg_clv_points": avg(b["clv_points"] for b in bets),
               "avg_edge_at_close_pct": avg(b["edge_at_close_pct"] for b in bets),
               "pct_toward": share(bets, "toward"), "pct_against": share(bets, "against"), "pct_flat": share(bets, "flat")}
    by_book = []
    for bk in sorted({b["book"] for b in bets}):
        rows = [b for b in bets if b["book"] == bk]
        stale = [b for b in rows if b["trigger"] == "stale" and b["book_moved_toward"] is not None]
        by_book.append({"book": bk, "book_name": names.get(bk, bk), "n": len(rows), "avg_clv_prob": avg(b["clv_prob"] for b in rows),
                        "pct_toward": share(rows, "toward"),
                        "stale_hit_rate": round(sum(1 for b in stale if b["book_moved_toward"]) / len(stale), 3) if stale else None,
                        "n_stale": len(stale)})
    by_trigger = []
    for t in sorted({b["trigger"] for b in bets}):
        rows = [b for b in bets if b["trigger"] == t]
        by_trigger.append({"trigger": t, "n": len(rows), "avg_clv_prob": avg(b["clv_prob"] for b in rows), "pct_toward": share(rows, "toward")})
    return {"summary": summary, "by_book": by_book, "by_trigger": by_trigger, "bets": bets}
