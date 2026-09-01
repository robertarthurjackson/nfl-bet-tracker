import math
import pandas as pd
import pytest

from nflbet.engine import odds, devig, kelly, clv
from nflbet.engine.margins import MarginModel, TotalModel


def test_odds_roundtrip():
    assert odds.american_to_decimal(-110) == pytest.approx(1.90909, 1e-4)
    assert odds.american_to_decimal(+320) == pytest.approx(4.2)
    assert odds.decimal_to_american(1.909) == -110
    assert odds.decimal_to_american(4.2) == 320
    assert odds.implied_prob(-400) == pytest.approx(0.8)
    assert odds.breakeven_prob(odds.american_to_decimal(-400)) == pytest.approx(0.8)


def test_ev():
    # 77.1% at -400 is negative EV; 82% is positive
    d = odds.american_to_decimal(-400)
    assert odds.ev_pct(0.771, d) < 0
    assert odds.ev_pct(0.82, d) == pytest.approx(2.5, abs=0.01)


def test_devig_methods_sum_to_one_and_order():
    q = [odds.implied_prob(-400), odds.implied_prob(320)]
    assert sum(q) > 1
    for m in devig.METHODS:
        p = devig.devig(q, m)
        assert sum(p) == pytest.approx(1.0, abs=1e-9)
        assert p[0] > p[1]
    # multiplicative matches the hand calc from the conversation: 80/103.8
    pm = devig.multiplicative(q)
    assert pm[0] == pytest.approx(0.8 / (0.8 + 100 / 420), abs=1e-6)
    # power takes more margin off the longshot -> favourite fair p higher than multiplicative
    assert devig.power(q)[0] > pm[0]


def test_kelly_basic_and_sensitivity():
    d = odds.american_to_decimal(-400)  # b = 0.25 -> f* = 5p - 4
    assert kelly.kelly_fraction(0.80, d) == pytest.approx(0.0, abs=1e-9)
    assert kelly.kelly_fraction(0.82, d) == pytest.approx(0.10, abs=1e-9)
    assert kelly.kelly_fraction(0.78, d) == 0.0
    assert kelly.price_sensitivity_factor(2.0) == 1.0          # even money
    assert kelly.price_sensitivity_factor(d) == pytest.approx(0.4)
    assert kelly.price_sensitivity_factor(3.0) == 1.0          # +200 capped at 1


def test_kelly_recommend_caps():
    d = odds.american_to_decimal(-400)
    r = kelly.recommend(0.85, d, 5000, 0.5, price_sensitivity_adjust=False, max_bet_pct=3)
    # f*=0.25, half kelly = 12.5% -> capped at 3%
    assert r.capped and r.recommended_pct == 3.0 and r.recommended_stake == 150.0
    r2 = kelly.recommend(0.85, d, 5000, 0.5, price_sensitivity_adjust=True, max_bet_pct=50)
    assert r2.recommended_pct == pytest.approx(0.25 * 0.5 * 0.4 * 100, abs=0.01)
    r3 = kelly.recommend(0.55, 1.909, 5000, 0.5, open_exposure=480, max_open_exposure_pct=10)
    assert r3.capped and "exposure" in r3.cap_reason and r3.recommended_pct == pytest.approx(0.4, abs=0.01)


def test_fraction_schedule():
    sched = [{"from_week": 1, "to_week": 2, "fraction": 0.25}, {"from_week": 3, "to_week": 5, "fraction": 0.333}]
    assert kelly.fraction_for_week(sched, 1) == 0.25
    assert kelly.fraction_for_week(sched, 4) == 0.333
    assert kelly.fraction_for_week(sched, 9, default=0.5) == 0.5


def test_growth_rate_half_kelly_is_75pct():
    p, d = 0.55, 2.0
    f = kelly.kelly_fraction(p, d)
    g_full = kelly.growth_rate(p, d, f)
    g_half = kelly.growth_rate(p, d, f / 2)
    assert g_half / g_full == pytest.approx(0.75, abs=0.01)


@pytest.fixture(scope="module")
def games():
    return pd.read_csv("data/cache/games.csv")


def test_margin_model_key_numbers(games):
    mm = MarginModel(games)
    freqs = {r["margin"]: r["freq"] for r in mm.margin_frequencies()}
    assert freqs[3] > freqs[2] and freqs[3] > freqs[4]      # 3 is the biggest key number
    assert freqs[7] > freqs[8] and freqs[7] > freqs[5]
    # half point across 3 is worth far more than across 4.5
    hp = {r["from"]: r["delta_p"] for r in mm.half_point_values()}
    assert hp[3.5] > hp[4.5] and hp[3.5] > 0.03
    # home -7 priced fair at mu=7: roughly a coin flip excluding pushes
    w, push, l = mm.cover_probs(7.0, -7.0)
    assert 0.04 < push < 0.12
    assert abs(w - l) < 0.1
    # inversion round-trips
    p = mm.p_cover_no_push(7.6, -7.5, "home")
    assert mm.implied_mu(-7.5, p) == pytest.approx(7.6, abs=0.15)
    # moneyline prob for a 7.5-point favourite is around 75-80%
    assert 0.68 < mm.p_win_ml(7.5) < 0.82


def test_total_model(games):
    tm = TotalModel(games)
    o, push, u = tm.probs(44.5, 44.5)
    assert abs(o - u) < 0.06 and push == 0
    assert tm.p_no_push(46.0, 44.5, "over") > 0.54
    assert tm.implied_total(44.5, tm.p_no_push(46.0, 44.5, "over")) == pytest.approx(46.0, abs=0.3)


def test_clv():
    out = clv.compute(market="spreads", side="home", line_taken=-7.0, price_taken_american=-110,
                      fair_p_at_bet=0.53, closing_line=-7.5, closing_fair_p_at_our_line=0.56)
    assert out["clv_points"] == 0.5 and out["clv_prob"] == pytest.approx(0.03) and out["clv_direction"] == "toward"
    # held under 44.5, closed 43.5: we hold the better number (+1.0) and the market moved toward us
    out = clv.compute(market="totals", side="under", line_taken=44.5, price_taken_american=-110,
                      fair_p_at_bet=0.52, closing_line=43.5, closing_fair_p_at_our_line=0.56)
    assert out["clv_points"] == 1.0 and out["clv_direction"] == "toward"
    out = clv.compute(market="totals", side="over", line_taken=44.5, price_taken_american=-110,
                      fair_p_at_bet=0.52, closing_line=43.5, closing_fair_p_at_our_line=0.49)
    assert out["clv_points"] == -1.0 and out["clv_direction"] == "against"
    out = clv.compute(market="h2h", side="away", line_taken=None, price_taken_american=320,
                      fair_p_at_bet=0.23, closing_line=None, closing_fair_p_at_our_line=0.231)
    assert out["clv_points"] is None and out["clv_direction"] == "flat"
