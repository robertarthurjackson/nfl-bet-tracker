# NFL Bet Tracker — API contract (v1)

Backend: FastAPI on `http://localhost:8000`. All routes under `/api`. JSON in/out. Times are ISO-8601 UTC.
In production FastAPI serves the built SPA from `web/dist` at `/`.

Enumerations
- market: `"h2h"` (moneyline) | `"spreads"` | `"totals"`
- side: `"home"` | `"away"` (h2h, spreads) ; `"over"` | `"under"` (totals)
- result: `null` | `"win"` | `"loss"` | `"push"` | `"void"`
- clv_direction: `"toward"` | `"against"` | `"flat"` | `null`
- trigger: `"manual"` | `"stale"` | `"threshold"`
- jurisdiction: `"AB"` | `"BC"` | `"reference"`  (reference = price source only, e.g. Pinnacle)

## GET /api/health → `{ "ok": true, "season": 2026, "week": 1, "api_key_set": bool }`

## Settings
GET /api/settings, PUT /api/settings (send full object back)
```json
{
  "season": 2026,
  "bankroll_starting": 5000,
  "ev_threshold_pct": 2.0,
  "devig_method": "power",
  "sharp_book": "pinnacle",
  "kelly": {
    "mode": "schedule",
    "fixed_fraction": 0.5,
    "schedule": [ {"from_week":1,"to_week":2,"fraction":0.25}, {"from_week":3,"to_week":5,"fraction":0.333}, {"from_week":6,"to_week":22,"fraction":0.5} ],
    "price_sensitivity_adjust": true,
    "max_bet_pct": 3.0,
    "max_open_exposure_pct": 10.0
  },
  "credit_budget_per_week": 115,
  "api_key_set": true
}
```

## Board
GET /api/board?week=1  (week optional → current week)
```json
{
  "season": 2026, "week": 1, "fetched_at": "…",
  "credits": { "remaining": 412, "used_month": 88, "budget_week": 115, "used_week": 40 },
  "kelly_fraction_this_week": 0.25,
  "games": [ {
    "game_id": "…", "kickoff": "…", "week": 1,
    "home": "JAX", "away": "CLE", "home_name": "Jacksonville Jaguars", "away_name": "Cleveland Browns",
    "fair": { "source": "pinnacle", "updated_at": "…",
              "home_ml_p": 0.771, "away_ml_p": 0.229,
              "fair_spread": -7.3, "fair_total": 41.5 },
    "markets": [ MarketRow, … ]
  } ]
}
```
MarketRow
```json
{
  "market": "spreads", "side": "home", "book": "bet365", "book_name": "bet365", "jurisdiction": "AB",
  "line": -7.0, "price_american": -110, "price_decimal": 1.909,
  "implied_p": 0.524, "fair_p": 0.548, "ev_pct": 4.6,
  "kelly": { "full_fraction": 0.052, "fraction_used": 0.25, "price_adjust": 1.0,
             "recommended_pct": 1.3, "recommended_stake": 65.0, "capped": false, "cap_reason": null },
  "is_best_price": true, "is_stale_candidate": false, "last_update": "…"
}
```
Rows exist for every enabled book × market × side. `fair_p` and `ev_pct` may be null when no fair price is available. `is_stale_candidate` = the sharp line moved recently and this book has not followed.

## Opportunities (alerts feed)
GET /api/opportunities?min_ev=2.0 → `[ { …MarketRow, "game_id", "home", "away", "kickoff", "week", "trigger" } ]` sorted by ev_pct desc.

## Games & line history
GET /api/games?week=1 → `[ { "game_id","week","kickoff","home","away","home_name","away_name","home_score","away_score","status":"scheduled"|"final" } ]`
GET /api/games/{game_id}/history?market=spreads&side=home → `[ { "captured_at","book","line","price_american" } ]` oldest first.

## Bets
GET /api/bets → `[ Bet ]` newest first
POST /api/bets  body:
```json
{ "game_id":"…","book":"bet365","market":"spreads","side":"home","line":-7.0,"price_american":-110,
  "stake":65,"fair_p_at_bet":0.548,"ev_pct_at_bet":4.6,"kelly_fraction_used":0.25,"trigger":"manual","note":"" }
```
Bet
```json
{ "id":1,"placed_at":"…","game_id":"…","home":"JAX","away":"CLE","kickoff":"…","week":1,
  "book":"bet365","book_name":"bet365","market":"spreads","side":"home","line":-7.0,
  "price_american":-110,"price_decimal":1.909,"stake":65,"to_win":59.1,
  "fair_p_at_bet":0.548,"ev_pct_at_bet":4.6,"kelly_fraction_used":0.25,"trigger":"manual","note":"",
  "result":null,"profit":null,
  "closing_line":null,"closing_price":null,"closing_fair_p":null,
  "clv_points":null,"clv_prob":null,"clv_direction":null }
```
PATCH /api/bets/{id} body: any of `{ "result", "note", "stake" }` (manual grade/void)
DELETE /api/bets/{id}

## Bankroll
GET /api/bankroll
```json
{ "starting":5000,"current":5120,"open_exposure":130,"open_exposure_pct":2.5,
  "summary": { "n_bets":12,"wins":7,"losses":4,"pushes":1,"staked":900,"profit":120,"roi_pct":13.3 },
  "history": [ { "at":"…","balance":5000,"event":"start","amount":0 }, { "at":"…","balance":5059,"event":"bet_settled","amount":59.1,"bet_id":1 } ]
}
```
POST /api/bankroll/adjust body `{ "amount": 500, "note": "deposit" }` (negative = withdrawal)

## CLV report
GET /api/clv
```json
{ "summary": { "n_closed":9,"avg_clv_prob":0.012,"avg_clv_points":0.3,"pct_toward":0.67,"pct_against":0.22,"pct_flat":0.11 },
  "by_book": [ { "book":"bet365","book_name":"bet365","n":5,"avg_clv_prob":0.018,"pct_toward":0.8,"stale_hit_rate":0.75 } ],
  "by_trigger": [ { "trigger":"stale","n":4,"avg_clv_prob":0.021,"pct_toward":0.75 } ],
  "bets": [ Bet ]  // only bets with closing data
}
```
`stale_hit_rate` = of bets triggered as stale at that book, share where the book later moved toward us.

## Shadow forecasts (no money)
GET /api/forecasts → `[ { "id","created_at","game_id","home","away","kickoff","week","market","side","line","my_p","market_p_at_time","outcome":null|1|0,"note" } ]`
POST /api/forecasts body `{ "game_id","market","side","line","my_p","note" }` (server fills market_p_at_time)
DELETE /api/forecasts/{id}
GET /api/forecasts/score
```json
{ "n_scored":14,"brier_mine":0.21,"brier_market":0.19,"log_loss_mine":0.61,"log_loss_market":0.57,
  "calibration": [ { "bucket":"70-80","n":5,"predicted_mine":0.76,"predicted_market":0.73,"actual":0.6 } ],
  "verdict": "market" | "mine" | "insufficient" }
```

## Backtests (from nflverse history)
GET /api/backtest/favorites?from=1999&to=2025
```json
{ "from":1999,"to":2025,"n_games":6700,
  "buckets": [ { "bucket":"-400 or shorter","n":300,"wins":248,"win_pct":0.827,"implied_p":0.81,"roi_pct":-1.2,"units":-3.6 } ],
  "note":"Flat 1u on the moneyline favorite at the closing price." }
```
GET /api/backtest/keynumbers → `{ "n_games":6700,"margins":[ {"margin":3,"freq":0.097}, … ],"half_point_value":[ {"from":3,"to":3.5,"delta_p":0.045} ] }`

## Books
GET /api/books → `[ { "key":"bet365","name":"bet365","region":"us","jurisdiction":"AB","enabled":true,"is_sharp":false } ]`
PUT /api/books/{key} body `{ "enabled": true }`

## Snapshots / scheduler
POST /api/snapshots/run?tier=sharp|soft|full → `{ "ok":true,"tier":"sharp","credits_used":2,"credits_remaining":410,"rows":312 }`
GET /api/snapshots/status
```json
{ "credits": { "remaining":412,"used_month":88,"budget_week":115,"used_week":40 },
  "last_runs": [ { "tier":"sharp","at":"…","credits_used":2,"rows":312,"ok":true,"error":null } ],
  "schedule": [ { "tier":"sharp","cron":"0 8-20 * * thu,fri","desc":"Hourly Thu/Fri betting window" } ],
  "scheduler_running": true }
```

## Method / docs
GET /api/method → `{ "markdown": "…" }` (contents of docs/METHOD.md; the Method page renders it)

## Errors
Non-2xx returns `{ "detail": "message" }`.

## Additions beyond v1 (implemented)
- Bet objects also carry `edge_at_close_pct` (EV of the price taken judged by the closing fair prob), `book_closing_line`, `book_closing_price`, `book_moved_toward` (bool|null; used for `stale_hit_rate`), `settled_at`.
- CLV summary also has `avg_edge_at_close_pct`; by_book rows have `n_stale`.
- Board games carry `status`, `home_score`, `away_score`; board root carries `ev_threshold_pct`; market rows carry `captured_at`.
- `credits` also has `live: bool` (false = fixture mode, snapshots cost nothing).
- Settings also has `stale_move_threshold` (fair-prob move at the sharp book that counts as a move; default 0.01).
- `GET /api/backtest/spreads?from=1999&to=2025` → favourite cover rate / ROI by spread size bucket.
- `POST /api/maintenance/run` → `{ graded, closing_filled, forecasts_graded }` (refresh results, grade, fill closing lines).
- `POST /api/snapshots/run?tier=…&force=true` bypasses the weekly credit budget.
- Forecast score also returns `min_n` (30).
