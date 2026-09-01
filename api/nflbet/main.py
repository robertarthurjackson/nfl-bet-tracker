"""FastAPI app. Serves /api/* and, when web/dist exists, the built SPA."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .core import Core, core_from_env
from .backtest.favorites import favorites_by_bucket, spread_favorites_by_bucket
from .scheduler import build_scheduler, maintenance, schedule_description
from .services import bets as bets_svc, board as board_svc, forecasts as fc_svc, snapshots as snap_svc

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nflbet")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, "web", "dist")
METHOD_MD = os.path.join(ROOT, "docs", "METHOD.md")


@asynccontextmanager
async def lifespan(app: FastAPI):
    core = core_from_env()
    app.state.core = core
    bets_svc.ensure_ledger(core)
    sched = None
    if os.environ.get("NFLBET_SCHEDULER", "1") != "0":
        sched = build_scheduler(core)
        sched.start()
    app.state.sched = sched
    log.info("nflbet up: season=%s week=%s live_odds=%s", core.season, core.current_week(), core.client.live)
    try:
        yield
    finally:
        if sched:
            sched.shutdown(wait=False)


app = FastAPI(title="nflbet", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=2048)


def C(request: Request) -> Core:
    return request.app.state.core


@app.exception_handler(Exception)
async def _err(request: Request, exc: Exception):
    log.exception("unhandled")
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ---- health / settings ------------------------------------------------------
@app.get("/api/health")
def health(request: Request):
    c = C(request)
    return {"ok": True, "season": c.season, "week": c.current_week(), "api_key_set": c.client.live}


@app.get("/api/settings")
def get_settings(request: Request):
    c = C(request)
    return {**c.settings, "api_key_set": c.client.live}


@app.put("/api/settings")
async def put_settings(request: Request):
    c = C(request)
    body = await request.json()
    try:
        s = c.save_settings(body)
    except AssertionError as e:
        raise HTTPException(400, str(e))
    if float(body.get("bankroll_starting", 0)) and not c.db.one("SELECT id FROM bets LIMIT 1"):
        # no bets yet: reset the ledger start to the new starting bankroll
        with c.db.tx() as tx:
            tx.execute("DELETE FROM ledger")
        bets_svc.ensure_ledger(c)
    return {**s, "api_key_set": c.client.live}


# ---- board ------------------------------------------------------------------
@app.get("/api/board")
def board(request: Request, week: int | None = None):
    return board_svc.build_board(C(request), week)


@app.get("/api/opportunities")
def opportunities(request: Request, min_ev: float | None = None):
    return board_svc.opportunities(C(request), min_ev)


@app.get("/api/games")
def games(request: Request, week: int | None = None):
    c = C(request)
    return [{k: g[k] for k in ("game_id", "week", "kickoff", "home", "away", "home_name", "away_name", "home_score", "away_score", "status")}
            for g in c.games(week or c.current_week())]


@app.get("/api/games/{game_id}/history")
def history(request: Request, game_id: str, market: str = "spreads", side: str = "home"):
    return C(request).db.q("SELECT captured_at, book, line, price AS price_american FROM odds_snapshots WHERE game_id=? AND market=? AND side=? ORDER BY id",
                           (game_id, market, side))


# ---- bets / bankroll / clv -------------------------------------------------
@app.get("/api/bets")
def bets(request: Request):
    return bets_svc.list_bets(C(request))


@app.post("/api/bets", status_code=201)
async def create_bet(request: Request):
    return bets_svc.create(C(request), await request.json())


@app.patch("/api/bets/{bet_id}")
async def patch_bet(request: Request, bet_id: int):
    return bets_svc.update(C(request), bet_id, await request.json())


@app.delete("/api/bets/{bet_id}", status_code=204)
def delete_bet(request: Request, bet_id: int):
    bets_svc.delete(C(request), bet_id)


@app.get("/api/bankroll")
def bankroll(request: Request):
    return bets_svc.bankroll(C(request))


@app.post("/api/bankroll/adjust")
async def adjust(request: Request):
    body = await request.json()
    try:
        amt = float(body["amount"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "amount required")
    return bets_svc.adjust(C(request), amt, body.get("note") or "")


@app.get("/api/clv")
def clv(request: Request):
    return bets_svc.clv_report(C(request))


# ---- forecasts --------------------------------------------------------------
@app.get("/api/forecasts")
def forecasts(request: Request):
    return fc_svc.list_all(C(request))


@app.post("/api/forecasts", status_code=201)
async def create_forecast(request: Request):
    return fc_svc.create(C(request), await request.json())


@app.delete("/api/forecasts/{fid}", status_code=204)
def delete_forecast(request: Request, fid: int):
    fc_svc.delete(C(request), fid)


@app.get("/api/forecasts/score")
def forecast_score(request: Request):
    return fc_svc.score(C(request))


# ---- research ---------------------------------------------------------------
@app.get("/api/backtest/favorites")
def bt_favorites(request: Request, from_: int = Query(2006, alias="from"), to: int | None = None):
    c = C(request)
    return favorites_by_bucket(c.games_df, from_, to or c.season - 1)


@app.get("/api/backtest/spreads")
def bt_spreads(request: Request, from_: int = Query(1999, alias="from"), to: int | None = None):
    c = C(request)
    return spread_favorites_by_bucket(c.games_df, from_, to or c.season - 1)


@app.get("/api/backtest/keynumbers")
def bt_keynumbers(request: Request):
    mm = C(request).margin_model
    return {"n_games": mm.n, "margins": mm.margin_frequencies(), "half_point_value": mm.half_point_values()}


# ---- books / snapshots ------------------------------------------------------
@app.get("/api/books")
def books(request: Request):
    return C(request).books()


@app.put("/api/books/{key}")
async def put_book(request: Request, key: str):
    c = C(request)
    body = await request.json()
    if not c.db.one("SELECT key FROM books WHERE key=?", (key,)):
        raise HTTPException(404, "no such book")
    with c.db.tx() as tx:
        tx.execute("UPDATE books SET enabled=? WHERE key=?", (int(bool(body.get("enabled", True))), key))
    return next(b for b in c.books() if b["key"] == key)


@app.post("/api/snapshots/run")
def run_snapshot(request: Request, tier: str = Query("sharp"), force: bool = False):
    try:
        return snap_svc.run_snapshot(C(request), tier, force=force)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/snapshots/status")
def snapshot_status(request: Request):
    st = snap_svc.status(C(request))
    sched = request.app.state.sched
    st["schedule"] = schedule_description()
    st["scheduler_running"] = bool(sched and sched.running)
    return st


@app.post("/api/maintenance/run")
def run_maintenance(request: Request):
    return maintenance(C(request))


@app.get("/api/method")
def method():
    if not os.path.exists(METHOD_MD):
        return {"markdown": "# Method\n\n(docs/METHOD.md not found)"}
    with open(METHOD_MD) as f:
        return {"markdown": f.read()}


# ---- SPA --------------------------------------------------------------------
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        candidate = os.path.join(DIST, path)
        if path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(DIST, "index.html"))
