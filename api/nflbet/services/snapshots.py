"""Tiered odds snapshots with a weekly credit budget."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..core import Core, utcnow
from ..data.books import bettable_keys
from ..data.nflverse import abbr_for
from ..data.oddsapi import estimate_cost, flatten

TIER_MARKETS = {
    "sharp": ["h2h", "spreads"],
    "soft": ["h2h", "spreads", "totals"],
    "full": ["h2h", "spreads", "totals"],
}


def tier_books(core: Core, tier: str) -> list[str]:
    books = core.books()
    sharp = [b["key"] for b in books if b["is_sharp"] and b["enabled"]] or [core.settings["sharp_book"]]
    soft = bettable_keys(books)
    if tier == "sharp":
        return sharp
    if tier == "soft":
        return soft
    return list(dict.fromkeys(sharp + soft))


def week_window_start(core: Core, now: datetime | None = None) -> datetime:
    """Budget week starts Tuesday 00:00 local."""
    now = (now or datetime.now(timezone.utc)).astimezone(core.tz)
    days_since_tue = (now.weekday() - 1) % 7
    start = (now - timedelta(days=days_since_tue)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(timezone.utc)


def credits_status(core: Core) -> dict:
    start = week_window_start(core).isoformat()
    used_week = core.db.one("SELECT COALESCE(SUM(credits_used),0) AS s FROM snapshot_runs WHERE at>=? AND from_fixture=0", (start,))["s"]
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    used_month_local = core.db.one("SELECT COALESCE(SUM(credits_used),0) AS s FROM snapshot_runs WHERE at>=? AND from_fixture=0", (month_start,))["s"]
    remaining = core.db.kv_get("credits_remaining")
    used_api = core.db.kv_get("credits_used_api")
    return {
        "remaining": remaining,
        "used_month": used_api if used_api is not None else used_month_local,
        "budget_week": int(core.settings["credit_budget_per_week"]),
        "used_week": int(used_week),
        "live": core.client.live,
    }


def _match_game(core: Core, games: list[dict], row: dict) -> str | None:
    h, a = abbr_for(row["home_name"]), abbr_for(row["away_name"])
    if not h or not a:
        return None
    ct = datetime.fromisoformat(row["commence_time"].replace("Z", "+00:00"))
    best = None
    for g in games:
        if g["home"] == h and g["away"] == a:
            ko = datetime.fromisoformat(g["kickoff"])
            if abs((ko - ct).total_seconds()) < 3 * 86400:
                best = g["game_id"]
                break
    return best


def run_snapshot(core: Core, tier: str, force: bool = False) -> dict:
    if tier not in TIER_MARKETS:
        raise ValueError("tier must be sharp|soft|full")
    markets, books = TIER_MARKETS[tier], tier_books(core, tier)
    cost = estimate_cost(markets, books)
    status = credits_status(core)
    if core.client.live and not force and status["used_week"] + cost > status["budget_week"]:
        msg = f"skipped: weekly credit budget ({status['used_week']}+{cost} > {status['budget_week']})"
        with core.db.tx() as c:
            c.execute("INSERT INTO snapshot_runs(at,tier,credits_used,rows,ok,error) VALUES(?,?,?,?,?,?)", (utcnow(), tier, 0, 0, 0, msg))
        return {"ok": False, "tier": tier, "credits_used": 0, "credits_remaining": status["remaining"], "rows": 0, "error": msg}

    at = utcnow()
    try:
        resp = core.client.fetch_odds(markets, books)
    except Exception as e:  # record failure
        with core.db.tx() as c:
            c.execute("INSERT INTO snapshot_runs(at,tier,credits_used,rows,ok,error) VALUES(?,?,?,?,?,?)", (at, tier, 0, 0, 0, str(e)))
        return {"ok": False, "tier": tier, "credits_used": 0, "credits_remaining": status["remaining"], "rows": 0, "error": str(e)}

    rows = flatten(resp.events)
    if not resp.from_fixture:
        # first live data: purge anything synthesized in fixture mode so it never mixes with real lines
        with core.db.tx() as c:
            c.execute("DELETE FROM odds_snapshots WHERE run_id IN (SELECT id FROM snapshot_runs WHERE from_fixture=1)")
            c.execute("DELETE FROM snapshot_runs WHERE from_fixture=1")
    games = core.games()
    event_to_game: dict[str, str | None] = {}
    inserted = 0
    seen_books: set[str] = set()
    with core.db.tx() as c:
        c.execute("INSERT INTO snapshot_runs(at,tier,credits_used,credits_remaining,rows,ok,from_fixture) VALUES(?,?,?,?,?,?,?)",
                  (at, tier, resp.last_cost or 0, resp.credits_remaining, 0, 1, int(resp.from_fixture)))
        run_id = c.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        for r in rows:
            if r["event_id"] not in event_to_game:
                event_to_game[r["event_id"]] = _match_game(core, games, r)
            gid = event_to_game[r["event_id"]]
            if not gid:
                continue
            c.execute("INSERT INTO odds_snapshots(run_id,captured_at,game_id,book,market,side,line,price,last_update) VALUES(?,?,?,?,?,?,?,?,?)",
                      (run_id, at, gid, r["book"], r["market"], r["side"], r["line"], r["price"], r["last_update"]))
            inserted += 1
            seen_books.add(r["book"])
        c.execute("UPDATE snapshot_runs SET rows=? WHERE id=?", (inserted, run_id))
        for gid_ev, gid in event_to_game.items():
            if gid:
                c.execute("UPDATE games SET event_id=? WHERE game_id=?", (gid_ev, gid))
        for bk in seen_books:
            c.execute("UPDATE books SET seen_at=? WHERE key=?", (at, bk))
    if resp.credits_remaining is not None:
        core.db.kv_set("credits_remaining", resp.credits_remaining)
    if resp.credits_used is not None:
        core.db.kv_set("credits_used_api", resp.credits_used)
    unmatched = sorted({k for k, v in event_to_game.items() if v is None})
    return {"ok": True, "tier": tier, "credits_used": resp.last_cost or 0, "credits_remaining": resp.credits_remaining,
            "rows": inserted, "from_fixture": resp.from_fixture, "unmatched_events": len(unmatched)}


def status(core: Core) -> dict:
    runs = core.db.q("SELECT at,tier,credits_used,credits_remaining,rows,ok,error,from_fixture FROM snapshot_runs ORDER BY id DESC LIMIT 25")
    for r in runs:
        r["ok"] = bool(r["ok"])
    return {"credits": credits_status(core), "last_runs": runs}


def sharp_moved(core: Core, threshold: float) -> list[dict]:
    """Games where the sharp book's spread/ML changed between the last two sharp snapshots."""
    sharp = core.settings["sharp_book"]
    runs = core.db.q("SELECT id FROM snapshot_runs WHERE ok=1 AND rows>0 ORDER BY id DESC LIMIT 2")
    if len(runs) < 2:
        return []
    cur, prev = runs[0]["id"], runs[1]["id"]
    rows = core.db.q("""SELECT game_id, market, side, line, price, run_id FROM odds_snapshots
                        WHERE book=? AND run_id IN (?,?) AND market IN ('h2h','spreads')""", (sharp, cur, prev))
    from ..engine.odds import implied_prob

    key = {}
    for r in rows:
        key.setdefault((r["game_id"], r["market"], r["side"]), {})[r["run_id"]] = r
    moved = []
    for (gid, mk, side), d in key.items():
        if cur in d and prev in d:
            a, b = d[cur], d[prev]
            dp = implied_prob(a["price"]) - implied_prob(b["price"])
            dl = (a["line"] or 0) - (b["line"] or 0)
            if abs(dp) >= threshold or abs(dl) >= 0.5:
                moved.append({"game_id": gid, "market": mk, "side": side, "dp": round(dp, 4), "dline": dl})
    return moved
