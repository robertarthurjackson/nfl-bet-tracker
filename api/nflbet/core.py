"""Application state: DB, settings, nflverse history + models, odds client."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from .db import Database
from .data import nflverse
from .data.books import REGISTRY
from .data.fixtures import build as build_fixture
from .data.oddsapi import OddsApiClient
from .engine.margins import MarginModel, TotalModel
from . import settings as settings_mod


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Core:
    def __init__(self, db_path: str, cache_dir: str, api_key: str | None = None, tz: str = "America/Edmonton"):
        self.db = Database(db_path)
        self.cache_dir = cache_dir
        self.tz = ZoneInfo(tz)
        self.client = OddsApiClient(api_key, fixture_provider=self._fixture)
        self.games_df: pd.DataFrame | None = None
        self.margin_model: MarginModel | None = None
        self.total_model: TotalModel | None = None
        self.load_history()
        self.sync_books()
        self.sync_schedule()

    # ---- settings -----------------------------------------------------------
    @property
    def settings(self) -> dict:
        return settings_mod.merged(self.db.get_settings_json())

    def save_settings(self, s: dict) -> dict:
        s = settings_mod.validate(settings_mod.merged(s))
        self.db.save_settings_json(s)
        return s

    @property
    def season(self) -> int:
        return int(self.settings["season"])

    # ---- history / models ---------------------------------------------------
    def load_history(self, force: bool = False) -> None:
        nflverse.refresh(self.cache_dir, force=force)
        self.games_df = nflverse.load(self.cache_dir)
        self.margin_model = MarginModel(self.games_df)
        self.total_model = TotalModel(self.games_df)

    # ---- books --------------------------------------------------------------
    def sync_books(self) -> None:
        with self.db.tx() as c:
            for b in REGISTRY:
                c.execute(
                    "INSERT OR IGNORE INTO books(key,name,region,jurisdiction,is_sharp,enabled,verified) VALUES(?,?,?,?,?,?,?)",
                    (b["key"], b["name"], b["region"], b["jurisdiction"], int(b["is_sharp"]), int(b["enabled"]), int(b["verified"])),
                )

    def books(self) -> list[dict]:
        rows = self.db.q("SELECT * FROM books ORDER BY jurisdiction, name")
        for r in rows:
            r["enabled"], r["is_sharp"], r["verified"] = bool(r["enabled"]), bool(r["is_sharp"]), bool(r["verified"])
        return rows

    def book_names(self) -> dict[str, str]:
        return {b["key"]: b["name"] for b in self.books()}

    # ---- schedule -----------------------------------------------------------
    def sync_schedule(self) -> int:
        games = nflverse.season_games(self.games_df, self.season)
        with self.db.tx() as c:
            for g in games:
                c.execute(
                    """INSERT INTO games(game_id,season,week,kickoff,home,away,home_name,away_name,home_score,away_score,status,
                       nv_spread_line,nv_total_line,nv_home_ml,nv_away_ml) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(game_id) DO UPDATE SET kickoff=excluded.kickoff, home_score=excluded.home_score,
                       away_score=excluded.away_score, status=excluded.status, nv_spread_line=excluded.nv_spread_line,
                       nv_total_line=excluded.nv_total_line, nv_home_ml=excluded.nv_home_ml, nv_away_ml=excluded.nv_away_ml""",
                    (g["game_id"], g["season"], g["week"], g["kickoff"], g["home"], g["away"], g["home_name"], g["away_name"],
                     g["home_score"], g["away_score"], g["status"], g["nv_spread_line"], g["nv_total_line"], g["nv_home_ml"], g["nv_away_ml"]),
                )
        return len(games)

    def games(self, week: int | None = None) -> list[dict]:
        if week is None:
            return self.db.q("SELECT * FROM games WHERE season=? ORDER BY kickoff", (self.season,))
        return self.db.q("SELECT * FROM games WHERE season=? AND week=? ORDER BY kickoff", (self.season, week))

    def game(self, game_id: str) -> dict | None:
        return self.db.one("SELECT * FROM games WHERE game_id=?", (game_id,))

    def current_week(self) -> int:
        return nflverse.current_week(self.games())

    # ---- fixtures -----------------------------------------------------------
    def _fixture(self, markets: list[str], bookmakers: list[str]) -> list[dict]:
        wk = self.current_week()
        games = self.games(wk) + self.games(wk + 1)
        return build_fixture(games, markets, bookmakers)


def core_from_env() -> Core:
    from dotenv import load_dotenv

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(here, ".env"))
    db_path = os.environ.get("NFLBET_DB", os.path.join(here, "data", "nflbet.db"))
    cache = os.path.join(here, "data", "cache")
    return Core(db_path, cache, api_key=os.environ.get("ODDS_API_KEY") or None, tz=os.environ.get("NFLBET_TZ", "America/Edmonton"))
