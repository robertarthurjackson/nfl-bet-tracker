"""Sportsbook registry.

`key` is The Odds API bookmaker key. Keys marked unverified are our best
guess at how the API names that book; run `nflbet discover-books` (costs ~5
credits) once you have an API key and the registry will be reconciled with
what the feed actually returns.

jurisdiction: AB = AGLC-licensed (bet only while physically in Alberta),
BC = BCLC PlayNow (BC residents, physically in BC), reference = price source
only (Pinnacle etc.), grey = offshore, not recommended for money.
"""
from __future__ import annotations

REGISTRY: list[dict] = [
    # sharp / reference
    {"key": "pinnacle",     "name": "Pinnacle",          "region": "eu", "jurisdiction": "reference", "is_sharp": True,  "enabled": True,  "verified": True},
    {"key": "lowvig",       "name": "LowVig",            "region": "us", "jurisdiction": "reference", "is_sharp": False, "enabled": False, "verified": True},
    {"key": "betonlineag",  "name": "BetOnline",         "region": "us", "jurisdiction": "reference", "is_sharp": False, "enabled": False, "verified": True},
    # Alberta (AGLC) — same brands as the US/Ontario feeds
    {"key": "fanduel",      "name": "FanDuel",           "region": "us", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "draftkings",   "name": "DraftKings",        "region": "us", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "betmgm",       "name": "BetMGM",            "region": "us", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "williamhill_us","name": "Caesars (paid feed only)", "region": "us", "jurisdiction": "AB", "is_sharp": False, "enabled": False, "verified": False},
    {"key": "betrivers",    "name": "BetRivers",         "region": "us", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "espnbet",      "name": "theScore Bet (ESPN Bet)", "region": "us", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "ballybet",     "name": "Bally Bet",         "region": "us", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "betway",       "name": "Betway",            "region": "uk", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "betvictor",    "name": "BetVictor",         "region": "uk", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "sportsinteraction_ca_on", "name": "Sports Interaction", "region": "ca", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    {"key": "pointsbetca",  "name": "PointsBet",         "region": "ca", "jurisdiction": "AB", "is_sharp": False, "enabled": True, "verified": True},
    # not in The Odds API feed (bet365/BET99 absent for NFL; Caesars is paid-tier only) — prices must be checked by hand
    {"key": "bet365",       "name": "bet365 (no feed)",  "region": "ca", "jurisdiction": "AB", "is_sharp": False, "enabled": False, "verified": False},
    {"key": "bet99",        "name": "BET99 (no feed)",   "region": "ca", "jurisdiction": "AB", "is_sharp": False, "enabled": False, "verified": False},
    # British Columbia
    {"key": "playnow_ca",   "name": "PlayNow (BCLC)",    "region": "ca", "jurisdiction": "BC", "is_sharp": False, "enabled": True, "verified": True},
    # grey market — price info only
    {"key": "bovada",       "name": "Bovada",            "region": "us", "jurisdiction": "grey", "is_sharp": False, "enabled": False, "verified": True},
]

BY_KEY = {b["key"]: b for b in REGISTRY}
BETTABLE_JURISDICTIONS = ("AB", "BC")


def bettable_keys(books: list[dict]) -> list[str]:
    return [b["key"] for b in books if b["enabled"] and b["jurisdiction"] in BETTABLE_JURISDICTIONS]
