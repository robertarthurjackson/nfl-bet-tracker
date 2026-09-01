"""Historical ROI of betting NFL moneyline favourites by price bucket (flat 1 unit
at the nflverse closing price). Answers: are heavy favourites mispriced?"""
from __future__ import annotations

import pandas as pd

BUCKETS = [("-100 to -150", -150, -100), ("-151 to -200", -200, -151), ("-201 to -300", -300, -201),
           ("-301 to -400", -400, -301), ("-401 to -600", -600, -401), ("-601 or shorter", -100000, -601)]


def favorites_by_bucket(df: pd.DataFrame, season_from: int = 2006, season_to: int = 2025) -> dict:
    g = df[(df["game_type"] == "REG") & (df["season"] >= season_from) & (df["season"] <= season_to)]
    g = g.dropna(subset=["home_moneyline", "away_moneyline", "result"])
    rows = []
    for r in g.itertuples(index=False):
        hm, am = float(r.home_moneyline), float(r.away_moneyline)
        if hm == am:
            continue
        fav_home = hm < am
        price = hm if fav_home else am
        if price >= 0:
            continue
        margin = float(r.result) if fav_home else -float(r.result)
        outcome = "push" if margin == 0 else ("win" if margin > 0 else "loss")
        rows.append((price, outcome))
    out = []
    for name, lo, hi in BUCKETS:
        bs = [(p, o) for p, o in rows if lo <= p <= hi]
        if not bs:
            continue
        n = len(bs)
        wins = sum(1 for _, o in bs if o == "win")
        pushes = sum(1 for _, o in bs if o == "push")
        units = sum((100 / abs(p)) if o == "win" else (0 if o == "push" else -1) for p, o in bs)
        avg_price = sum(p for p, _ in bs) / n
        implied = sum(abs(p) / (abs(p) + 100) for p, _ in bs) / n
        out.append({"bucket": name, "n": n, "wins": wins, "pushes": pushes, "win_pct": round(wins / max(1, n - pushes), 4),
                    "implied_p": round(implied, 4), "avg_price": round(avg_price), "roi_pct": round(units / n * 100, 2), "units": round(units, 1)})
    return {"from": season_from, "to": season_to, "n_games": len(rows), "buckets": out,
            "note": "Flat 1u on the moneyline favourite at the nflverse closing price, regular season only. "
                    "win_pct excludes pushes; implied_p is the average break-even probability at the price paid."}


def spread_favorites_by_bucket(df: pd.DataFrame, season_from: int = 1999, season_to: int = 2025) -> dict:
    """Cover rate of favourites by closing spread size (flat 1u at -110)."""
    g = df[(df["game_type"] == "REG") & (df["season"] >= season_from) & (df["season"] <= season_to)].dropna(subset=["spread_line", "result"])
    edges = [(0, 3, "0 to 3"), (3.5, 6.5, "3.5 to 6.5"), (7, 9.5, "7 to 9.5"), (10, 13.5, "10 to 13.5"), (14, 99, "14+")]
    out = []
    for lo, hi, name in edges:
        rows = g[(g["spread_line"].abs() >= lo) & (g["spread_line"].abs() <= hi)]
        if rows.empty:
            continue
        fav_margin = rows["result"] * rows["spread_line"].apply(lambda s: 1 if s > 0 else -1)
        adj = fav_margin - rows["spread_line"].abs()
        w, l, p = int((adj > 0).sum()), int((adj < 0).sum()), int((adj == 0).sum())
        units = w * (100 / 110) - l
        out.append({"bucket": name, "n": len(rows), "fav_cover_pct": round(w / max(1, w + l), 4), "pushes": p,
                    "roi_pct_fav": round(units / len(rows) * 100, 2), "roi_pct_dog": round((l * (100 / 110) - w) / len(rows) * 100, 2)})
    return {"from": season_from, "to": season_to, "buckets": out, "note": "Favourite vs the closing spread at -110, flat 1u."}
