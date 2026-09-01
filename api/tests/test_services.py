"""Service-level tests on a temp DB with fixture odds."""
import os
import pytest

from nflbet.core import Core
from nflbet.services import snapshots, board, bets, forecasts


@pytest.fixture
def core(tmp_path):
    return Core(str(tmp_path / "t.db"), "data/cache")


def _first_game(core):
    wk = core.current_week()
    return core.games(wk)[0]


def test_snapshot_board_and_bet_lifecycle(core):
    r = snapshots.run_snapshot(core, "full")
    assert r["ok"] and r["rows"] > 0 and r["from_fixture"]
    b = board.build_board(core)
    assert b["games"] and all(g["fair"]["source"] == "pinnacle" for g in b["games"] if g["markets"])
    g = b["games"][0]
    # fair spread should sit close to Pinnacle's line when Pinnacle prices it ~50/50
    pin = [m for m in g["markets"] if m["book"] == "pinnacle" and m["market"] == "spreads" and m["side"] == "home"][0]
    assert abs(g["fair"]["fair_spread"] - pin["line"]) < 1.0
    # ML fair p consistent with spread-derived p within a few points
    row = [m for m in g["markets"] if m["market"] == "h2h" and m["side"] == "home"][0]
    assert abs(row["fair_p"] - g["fair"]["home_ml_p"]) < 1e-9
    bt = bets.create(core, {"game_id": g["game_id"], "book": row["book"], "market": "h2h", "side": "home",
                            "price_american": row["price_american"], "stake": 100, "fair_p_at_bet": row["fair_p"],
                            "ev_pct_at_bet": row["ev_pct"], "kelly_fraction_used": 0.25})
    assert bt["to_win"] > 0 and bets.open_exposure(core) == 100
    # finalise the game in the past and grade + fill closing lines
    with core.db.tx() as c:
        c.execute("UPDATE games SET status='final', home_score=27, away_score=20, kickoff='2026-01-01T00:00:00+00:00' WHERE game_id=?", (g["game_id"],))
        c.execute("UPDATE odds_snapshots SET captured_at='2025-12-31T23:00:00+00:00' WHERE game_id=?", (g["game_id"],))
    assert bets.grade_all(core) == 1
    assert bets.fill_closing_lines(core) == 1
    b2 = bets.list_bets(core)[0]
    assert b2["result"] == "win" and b2["profit"] == pytest.approx(100 * (b2["price_decimal"] - 1), abs=0.1)
    assert b2["closing_fair_p"] is not None and b2["clv_direction"] in ("toward", "against", "flat")
    assert bets.current_bankroll(core) == pytest.approx(5000 + b2["profit"], abs=0.01)
    rep = bets.clv_report(core)
    assert rep["summary"]["n_closed"] == 1 and rep["by_book"][0]["book"] == row["book"]
    # delete reverses the ledger
    bets.delete(core, b2["id"])
    assert bets.current_bankroll(core) == pytest.approx(5000)


def test_spread_bet_settlement_and_clv_points(core):
    snapshots.run_snapshot(core, "full")
    g = _first_game(core)
    bt = bets.create(core, {"game_id": g["game_id"], "book": "fanduel", "market": "spreads", "side": "away", "line": 3.0,
                            "price_american": -110, "stake": 50, "fair_p_at_bet": 0.5})
    with core.db.tx() as c:
        c.execute("UPDATE games SET status='final', home_score=24, away_score=21, kickoff='2026-01-01T00:00:00+00:00' WHERE game_id=?", (g["game_id"],))
        c.execute("UPDATE odds_snapshots SET captured_at='2025-12-31T23:00:00+00:00' WHERE game_id=?", (g["game_id"],))
        # force the sharp closing line to away +3.5 so we hold the worse number by 0.5
        c.execute("UPDATE odds_snapshots SET line=3.5 WHERE game_id=? AND book='pinnacle' AND market='spreads' AND side='away'", (g["game_id"],))
        c.execute("UPDATE odds_snapshots SET line=-3.5 WHERE game_id=? AND book='pinnacle' AND market='spreads' AND side='home'", (g["game_id"],))
    bets.grade_all(core)
    bets.fill_closing_lines(core)
    b = bets.list_bets(core)[0]
    assert b["result"] == "push"                       # 24-21 with away +3 = push
    assert b["closing_line"] == 3.5 and b["clv_points"] == -0.5


def test_forecast_grading_and_score(core):
    snapshots.run_snapshot(core, "sharp")
    g = _first_game(core)
    f = forecasts.create(core, {"game_id": g["game_id"], "market": "h2h", "side": "home", "my_p": 80})
    assert f["market_p_at_time"] is not None and f["my_p"] == 0.8
    with core.db.tx() as c:
        c.execute("UPDATE games SET status='final', home_score=30, away_score=10 WHERE game_id=?", (g["game_id"],))
    assert forecasts.grade_all(core) == 1
    s = forecasts.score(core)
    assert s["n_scored"] == 1 and s["verdict"] == "insufficient" and s["brier_mine"] == pytest.approx(0.04)


def test_settings_roundtrip_and_kelly_week(core):
    s = core.settings
    s["ev_threshold_pct"] = 1.5
    s["kelly"]["mode"] = "fixed"
    s["kelly"]["fixed_fraction"] = 0.5
    core.save_settings(s)
    assert core.settings["ev_threshold_pct"] == 1.5
    assert board.kelly_fraction_for(core.settings, 1) == 0.5
    s["kelly"]["mode"] = "schedule"
    core.save_settings(s)
    assert board.kelly_fraction_for(core.settings, 1) == 0.25
    assert board.kelly_fraction_for(core.settings, 10) == 0.5


def test_budget_skip_when_live(core, monkeypatch):
    # pretend the key is live but the weekly budget is exhausted -> skip without calling the network
    core.client.api_key = "x"
    with core.db.tx() as c:
        from nflbet.core import utcnow
        c.execute("INSERT INTO snapshot_runs(at,tier,credits_used,rows,ok) VALUES(?,'full',999,0,1)", (utcnow(),))
    r = snapshots.run_snapshot(core, "sharp")
    assert not r["ok"] and "budget" in r["error"]
