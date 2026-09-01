from __future__ import annotations

import copy
import json

DEFAULTS = {
    "season": 2026,
    "bankroll_starting": 5000.0,
    "ev_threshold_pct": 2.0,
    "devig_method": "power",
    "sharp_book": "pinnacle",
    "kelly": {
        "mode": "schedule",            # schedule | fixed
        "fixed_fraction": 0.5,
        "schedule": [
            {"from_week": 1, "to_week": 2, "fraction": 0.25},
            {"from_week": 3, "to_week": 5, "fraction": 0.333},
            {"from_week": 6, "to_week": 22, "fraction": 0.5},
        ],
        "price_sensitivity_adjust": True,
        "max_bet_pct": 3.0,
        "max_open_exposure_pct": 10.0,
    },
    "credit_budget_per_week": 115,
    "stale_move_threshold": 0.01,      # fair-prob move at the sharp book that counts as a "move"
}


def merged(stored: dict | None) -> dict:
    s = copy.deepcopy(DEFAULTS)
    if stored:
        for k, v in stored.items():
            if k == "kelly" and isinstance(v, dict):
                s["kelly"].update(v)
            elif k != "api_key_set":
                s[k] = v
    return s


def validate(s: dict) -> dict:
    k = s["kelly"]
    assert 0 < float(k["fixed_fraction"]) <= 1, "fixed_fraction must be in (0,1]"
    assert 0 < float(k["max_bet_pct"]) <= 100
    assert 0 < float(k["max_open_exposure_pct"]) <= 100
    assert s["devig_method"] in ("power", "multiplicative", "additive", "shin")
    for row in k["schedule"]:
        assert 0 < float(row["fraction"]) <= 1
    assert float(s["bankroll_starting"]) > 0
    return s


def dumps(s: dict) -> str:
    return json.dumps(s)
