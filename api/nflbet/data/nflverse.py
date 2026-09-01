"""nflverse games data: schedule, results, historical closing lines.
Source: https://github.com/nflverse/nfldata/raw/master/data/games.csv (free)."""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
ET = ZoneInfo("America/New_York")

TEAM_NAMES = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers", "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings", "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}
NAME_TO_ABBR = {v: k for k, v in TEAM_NAMES.items()}
# aliases seen in odds feeds
NAME_TO_ABBR.update({"Washington Football Team": "WAS", "Washington Redskins": "WAS", "Oakland Raiders": "LV",
                     "San Diego Chargers": "LAC", "St. Louis Rams": "LA", "LA Rams": "LA", "LA Chargers": "LAC"})


def abbr_for(name: str) -> str | None:
    if name in NAME_TO_ABBR:
        return NAME_TO_ABBR[name]
    # fuzzy: match on nickname
    nick = name.split()[-1].lower()
    for full, ab in NAME_TO_ABBR.items():
        if full.split()[-1].lower() == nick:
            return ab
    return None


def games_path(cache_dir: str) -> str:
    return os.path.join(cache_dir, "games.csv")


def refresh(cache_dir: str, max_age_hours: float = 6.0, force: bool = False) -> str:
    """Download games.csv if stale. Returns the path."""
    os.makedirs(cache_dir, exist_ok=True)
    p = games_path(cache_dir)
    if not force and os.path.exists(p) and (time.time() - os.path.getmtime(p)) < max_age_hours * 3600:
        return p
    try:
        r = httpx.get(URL, follow_redirects=True, timeout=60)
        r.raise_for_status()
        with open(p + ".tmp", "wb") as f:
            f.write(r.content)
        os.replace(p + ".tmp", p)
    except Exception:
        if not os.path.exists(p):
            raise
    return p


def load(cache_dir: str) -> pd.DataFrame:
    df = pd.read_csv(games_path(cache_dir), low_memory=False)
    return df


def kickoff_utc(gameday: str, gametime: str | float | None) -> datetime:
    t = gametime if isinstance(gametime, str) and gametime else "13:00"
    dt = datetime.strptime(f"{gameday} {t}", "%Y-%m-%d %H:%M").replace(tzinfo=ET)
    return dt.astimezone(timezone.utc)


def season_games(df: pd.DataFrame, season: int) -> list[dict]:
    g = df[(df["season"] == season) & (df["game_type"] == "REG")].copy()
    out = []
    for r in g.itertuples(index=False):
        ko = kickoff_utc(r.gameday, r.gametime)
        final = pd.notna(r.home_score) and pd.notna(r.away_score)
        out.append({
            "game_id": r.game_id, "season": int(r.season), "week": int(r.week), "kickoff": ko.isoformat(),
            "home": r.home_team, "away": r.away_team,
            "home_name": TEAM_NAMES.get(r.home_team, r.home_team), "away_name": TEAM_NAMES.get(r.away_team, r.away_team),
            "home_score": int(r.home_score) if final else None, "away_score": int(r.away_score) if final else None,
            "status": "final" if final else "scheduled",
            "nv_spread_line": float(r.spread_line) if pd.notna(r.spread_line) else None,
            "nv_total_line": float(r.total_line) if pd.notna(r.total_line) else None,
            "nv_home_ml": float(r.home_moneyline) if pd.notna(r.home_moneyline) else None,
            "nv_away_ml": float(r.away_moneyline) if pd.notna(r.away_moneyline) else None,
        })
    return out


def current_week(games: list[dict], now: datetime | None = None, grace_hours: float = 8.0) -> int:
    """Week of the earliest game that hasn't finished (kickoff + grace)."""
    now = now or datetime.now(timezone.utc)
    pending = [g for g in games if datetime.fromisoformat(g["kickoff"]) + timedelta(hours=grace_hours) > now]
    if pending:
        return min(g["week"] for g in pending)
    return max((g["week"] for g in games), default=1)


def current_season(df: pd.DataFrame, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    seasons = sorted(df["season"].unique())
    # NFL season N runs Sep N .. Feb N+1
    yr = now.year if now.month >= 3 else now.year - 1
    return int(max(s for s in seasons if s <= yr)) if any(s <= yr for s in seasons) else int(seasons[-1])
