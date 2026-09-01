"""The Odds API v4 client with credit accounting + offline fixture mode.

Cost rule: one request costs (number of markets) x (number of regions), where
an explicit `bookmakers=` list counts as one region per 10 bookmakers. We
always pass explicit bookmakers, so a Pinnacle-only pulse for h2h+spreads
costs 2 credits and a 10-book soft check costs the same.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass, field

import httpx

BASE = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"


@dataclass
class OddsResponse:
    events: list[dict]
    credits_used: int | None
    credits_remaining: int | None
    last_cost: int | None
    from_fixture: bool = False
    warnings: list[str] = field(default_factory=list)


def estimate_cost(markets: list[str], bookmakers: list[str]) -> int:
    return len(markets) * max(1, math.ceil(len(bookmakers) / 10))


class OddsApiClient:
    def __init__(self, api_key: str | None = None, fixture_provider=None):
        self.api_key = api_key or os.environ.get("ODDS_API_KEY") or None
        self.fixture_provider = fixture_provider

    @property
    def live(self) -> bool:
        return bool(self.api_key)

    def fetch_odds(self, markets: list[str], bookmakers: list[str]) -> OddsResponse:
        if not self.live:
            if self.fixture_provider is None:
                raise RuntimeError("No ODDS_API_KEY and no fixture provider")
            events = self.fixture_provider(markets, bookmakers)
            return OddsResponse(events=events, credits_used=None, credits_remaining=None, last_cost=0, from_fixture=True)
        params = {
            "apiKey": self.api_key, "markets": ",".join(markets), "bookmakers": ",".join(bookmakers),
            "oddsFormat": "american", "dateFormat": "iso",
        }
        r = httpx.get(f"{BASE}/sports/{SPORT}/odds", params=params, timeout=30)
        if r.status_code == 401:
            raise RuntimeError("Odds API rejected the key (401)")
        if r.status_code == 429:
            raise RuntimeError("Odds API quota exhausted (429)")
        r.raise_for_status()
        h = r.headers
        return OddsResponse(
            events=r.json(),
            credits_used=_int(h.get("x-requests-used")),
            credits_remaining=_int(h.get("x-requests-remaining")),
            last_cost=_int(h.get("x-requests-last")),
        )

    def discover_bookmakers(self, regions=("us", "us2", "uk", "eu", "au", "ca")) -> tuple[set[str], OddsResponse]:
        """One h2h call across regions (costs len(regions) credits) to learn which keys exist."""
        if not self.live:
            raise RuntimeError("discover_bookmakers needs a live API key")
        params = {"apiKey": self.api_key, "markets": "h2h", "regions": ",".join(regions), "oddsFormat": "american"}
        r = httpx.get(f"{BASE}/sports/{SPORT}/odds", params=params, timeout=30)
        r.raise_for_status()
        events = r.json()
        keys = {b["key"] for ev in events for b in ev.get("bookmakers", [])}
        titles = {b["key"]: b["title"] for ev in events for b in ev.get("bookmakers", [])}
        h = r.headers
        resp = OddsResponse(events=events, credits_used=_int(h.get("x-requests-used")),
                            credits_remaining=_int(h.get("x-requests-remaining")), last_cost=_int(h.get("x-requests-last")))
        resp.warnings = [f"{k}: {titles[k]}" for k in sorted(keys)]
        return keys, resp


def _int(v):
    try:
        return int(v) if v is not None else None
    except ValueError:
        return None


def flatten(events: list[dict]) -> list[dict]:
    """Odds API event list -> flat rows:
    {event_id, commence_time, home_name, away_name, book, market, side, line, price, last_update}
    side is home/away for h2h and spreads, over/under for totals. Spread lines are from the side's perspective."""
    rows = []
    for ev in events:
        home, away = ev["home_team"], ev["away_team"]
        for bk in ev.get("bookmakers", []):
            for m in bk.get("markets", []):
                key = m["key"]
                for o in m.get("outcomes", []):
                    name = o["name"]
                    if key == "totals":
                        side = name.lower()
                        if side not in ("over", "under"):
                            continue
                    elif name == home:
                        side = "home"
                    elif name == away:
                        side = "away"
                    else:
                        continue
                    rows.append({
                        "event_id": ev["id"], "commence_time": ev["commence_time"], "home_name": home, "away_name": away,
                        "book": bk["key"], "book_title": bk.get("title", bk["key"]), "market": key, "side": side,
                        "line": o.get("point"), "price": int(o["price"]), "last_update": m.get("last_update") or bk.get("last_update"),
                    })
    return rows
