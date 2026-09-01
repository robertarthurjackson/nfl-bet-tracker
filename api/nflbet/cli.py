"""CLI helpers:  python -m nflbet.cli <command>
  snapshot [sharp|soft|full] [--force]   run one snapshot
  discover-books                          learn which bookmaker keys the feed offers (~6 credits)
  maintenance                             refresh results, grade bets, fill closing lines
  backtest                                print the favourites-by-price table
"""
from __future__ import annotations

import json
import sys

from .core import core_from_env


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    cmd, *rest = argv
    core = core_from_env()
    if cmd == "snapshot":
        from .services.snapshots import run_snapshot

        tier = rest[0] if rest and not rest[0].startswith("--") else "sharp"
        print(json.dumps(run_snapshot(core, tier, force="--force" in rest), indent=2))
    elif cmd == "discover-books":
        keys, resp = core.client.discover_bookmakers()
        known = {b["key"] for b in core.books()}
        print("bookmaker keys in feed:")
        for w in resp.warnings:
            print("  ", w, "(in registry)" if w.split(":")[0] in known else "")
        missing = sorted(known - keys)
        print("registry keys NOT in feed (disable or fix):", missing)
        with core.db.tx() as c:
            for k in keys:
                c.execute("INSERT OR IGNORE INTO books(key,name,region,jurisdiction,is_sharp,enabled,verified) VALUES(?,?,?,?,0,0,1)",
                          (k, next((w.split(': ', 1)[1] for w in resp.warnings if w.startswith(k + ':')), k), "?", "grey"))
                c.execute("UPDATE books SET verified=1, seen_at=datetime('now') WHERE key=?", (k,))
        print("credits remaining:", resp.credits_remaining)
    elif cmd == "maintenance":
        from .scheduler import maintenance

        print(json.dumps(maintenance(core), indent=2))
    elif cmd == "backtest":
        from .backtest.favorites import favorites_by_bucket

        r = favorites_by_bucket(core.games_df)
        print(f"{'bucket':16} {'n':>5} {'win%':>6} {'implied':>8} {'ROI%':>6} {'units':>7}")
        for b in r["buckets"]:
            print(f"{b['bucket']:16} {b['n']:5d} {b['win_pct']*100:6.1f} {b['implied_p']*100:8.1f} {b['roi_pct']:6.2f} {b['units']:7.1f}")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
