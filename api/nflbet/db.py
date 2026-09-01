"""SQLite storage. Plain sqlite3; small schema; one writer."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id=1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS books (
  key TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT, jurisdiction TEXT NOT NULL,
  is_sharp INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, verified INTEGER NOT NULL DEFAULT 0,
  seen_at TEXT);
CREATE TABLE IF NOT EXISTS games (
  game_id TEXT PRIMARY KEY, season INTEGER, week INTEGER, kickoff TEXT, home TEXT, away TEXT,
  home_name TEXT, away_name TEXT, home_score INTEGER, away_score INTEGER, status TEXT,
  nv_spread_line REAL, nv_total_line REAL, nv_home_ml REAL, nv_away_ml REAL, event_id TEXT);
CREATE INDEX IF NOT EXISTS ix_games_week ON games(season, week);
CREATE TABLE IF NOT EXISTS snapshot_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, tier TEXT NOT NULL, credits_used INTEGER NOT NULL DEFAULT 0,
  credits_remaining INTEGER, rows INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 1, error TEXT, from_fixture INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, captured_at TEXT NOT NULL, game_id TEXT NOT NULL,
  book TEXT NOT NULL, market TEXT NOT NULL, side TEXT NOT NULL, line REAL, price INTEGER NOT NULL, last_update TEXT);
CREATE INDEX IF NOT EXISTS ix_snap_game ON odds_snapshots(game_id, market, side, book, captured_at);
CREATE INDEX IF NOT EXISTS ix_snap_time ON odds_snapshots(captured_at);
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, placed_at TEXT NOT NULL, game_id TEXT NOT NULL, book TEXT NOT NULL,
  market TEXT NOT NULL, side TEXT NOT NULL, line REAL, price_american INTEGER NOT NULL, stake REAL NOT NULL,
  fair_p_at_bet REAL, ev_pct_at_bet REAL, kelly_fraction_used REAL, trigger TEXT DEFAULT 'manual', note TEXT DEFAULT '',
  result TEXT, profit REAL, settled_at TEXT,
  closing_line REAL, closing_price INTEGER, closing_fair_p REAL, clv_points REAL, clv_prob REAL, clv_direction TEXT,
  edge_at_close_pct REAL, book_closing_line REAL, book_closing_price INTEGER, book_moved_toward INTEGER);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, event TEXT NOT NULL, amount REAL NOT NULL,
  balance REAL NOT NULL, bet_id INTEGER, note TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, game_id TEXT NOT NULL, market TEXT NOT NULL,
  side TEXT NOT NULL, line REAL, my_p REAL NOT NULL, market_p_at_time REAL, outcome INTEGER, note TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
"""


class Database:
    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(SCHEMA)  # executescript manages its own transaction

    @contextmanager
    def tx(self):
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                yield self._conn
                self._conn.execute("COMMIT")
            except Exception:
                self._conn.execute("ROLLBACK")
                raise

    def q(self, sql: str, params=()) -> list[dict]:
        with self._lock:
            cur = self._conn.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]

    def one(self, sql: str, params=()) -> dict | None:
        rows = self.q(sql, params)
        return rows[0] if rows else None

    # settings / kv
    def get_settings_json(self) -> dict | None:
        r = self.one("SELECT json FROM settings WHERE id=1")
        return json.loads(r["json"]) if r else None

    def save_settings_json(self, s: dict) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO settings(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json", (json.dumps(s),))

    def kv_get(self, k: str, default=None):
        r = self.one("SELECT v FROM kv WHERE k=?", (k,))
        return json.loads(r["v"]) if r else default

    def kv_set(self, k: str, v) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, json.dumps(v)))
