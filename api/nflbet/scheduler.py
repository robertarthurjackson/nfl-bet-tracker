"""Polling schedule (local time, default America/Edmonton).

Budget tiers:  sharp = Pinnacle ML+spread (2 credits) | soft = bettable books, 3 markets (3 credits per 10 books)
               full = both (~6 credits). Closing snapshots run with force=True so CLV is never sacrificed to the budget.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .core import Core
from .services import bets as bets_svc, forecasts as fc_svc
from .services.snapshots import run_snapshot, sharp_moved, credits_status

log = logging.getLogger("nflbet.scheduler")

SCHEDULE = [
    {"id": "tue_open",  "tier": "full",  "cron": "0 9 * * tue",       "force": False, "desc": "Tuesday openers (full)"},
    {"id": "wed_soft",  "tier": "soft",  "cron": "0 12,18 * * wed",   "force": False, "desc": "Wednesday soft-book checks"},
    {"id": "sharp",     "tier": "sharp", "cron": "0 8-20 * * thu,fri", "force": False, "desc": "Hourly sharp pulse, Thu/Fri betting window"},
    {"id": "soft",      "tier": "soft",  "cron": "30 9,12,15,18 * * thu,fri", "force": False, "desc": "Soft-book checks, Thu/Fri"},
    {"id": "sat_full",  "tier": "full",  "cron": "0 12 * * sat",      "force": False, "desc": "Saturday full snapshot"},
    {"id": "close_thu", "tier": "full",  "cron": "0 18 * * thu",      "force": True,  "desc": "TNF closing lines"},
    {"id": "close_sun1","tier": "full",  "cron": "30 10 * * sun",     "force": True,  "desc": "Sunday early-window closing lines"},
    {"id": "close_sun2","tier": "full",  "cron": "0 14 * * sun",      "force": True,  "desc": "Sunday late-window closing lines"},
    {"id": "close_sun3","tier": "full",  "cron": "0 18 * * sun",      "force": True,  "desc": "SNF closing lines"},
    {"id": "close_mon", "tier": "full",  "cron": "0 18 * * mon",      "force": True,  "desc": "MNF closing lines"},
]


def schedule_description() -> list[dict]:
    return [{"tier": s["tier"], "cron": s["cron"], "desc": s["desc"]} for s in SCHEDULE]


def maintenance(core: Core) -> dict:
    """Refresh results, grade bets/forecasts, fill closing lines."""
    try:
        core.load_history(force=True)
        core.sync_schedule()
    except Exception as e:
        log.warning("nflverse refresh failed: %s", e)
    graded = bets_svc.grade_all(core)
    closed = bets_svc.fill_closing_lines(core)
    fgraded = fc_svc.grade_all(core)
    return {"graded": graded, "closing_filled": closed, "forecasts_graded": fgraded}


def _run(core: Core, tier: str, force: bool):
    res = run_snapshot(core, tier, force=force)
    log.info("snapshot %s: %s", tier, res)
    if tier == "sharp" and res.get("ok"):
        moved = sharp_moved(core, float(core.settings.get("stale_move_threshold", 0.01)))
        if moved:
            log.info("sharp moved on %d markets -> soft check", len(moved))
            run_snapshot(core, "soft", force=False)


def build_scheduler(core: Core) -> BackgroundScheduler:
    sched = BackgroundScheduler(timezone=core.tz)
    for s in SCHEDULE:
        sched.add_job(_run, CronTrigger.from_crontab(s["cron"], timezone=core.tz), args=[core, s["tier"], s["force"]],
                      id=s["id"], name=s["desc"], misfire_grace_time=900, coalesce=True)
    sched.add_job(maintenance, CronTrigger.from_crontab("0 6 * * *", timezone=core.tz), args=[core], id="maintenance",
                  name="Daily: results, grading, closing lines", misfire_grace_time=3600, coalesce=True)
    return sched
