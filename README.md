# NFL +EV Bet Tracker

Personal decision-support and record-keeping tool for NFL betting from Alberta/BC. It finds prices at
bettable books that beat the devigged sharp line, sizes stakes with fractional Kelly, logs bets, and
keeps score by **closing line value** — the empirical measure of whether the process is working.

It does not place bets. See [`docs/METHOD.md`](docs/METHOD.md) for the full method (Kelly formula,
devig, key numbers, CLV, and what the Kaunitz et al. paper showed).

## The strategy in one paragraph

Take the sharpest book's price (Pinnacle), remove the vig, call that the fair probability `p`. Any
Alberta/BC book offering a price whose break-even probability is below `p` is a +EV bet. Stake
`f* = p − q/b` scaled by a Kelly fraction (¼ early season → ½), with a short-price adjustment and
hard caps. Record the bet; after kickoff record the sharp closing line; track CLV by book and by trigger
so stale lines (book was slow — positive CLV) separate from shaded lines (book knew — flat CLV).
This is the method validated live by Kaunitz, Zhong & Kreiner (2017): +8.5% over 265 bets — until
the books limited every account. **The edge is real and modest; the constraint is access.**

## Layout

```
api/     Python 3.12 · FastAPI · SQLite · APScheduler     (engine, data, services, scheduler)
web/     Vite · React · TypeScript · PWA                  (installs to the iPhone home screen)
docs/    API.md (contract) · METHOD.md (rendered in-app on the Method page)
```

## Setup

### Get it running (no experience needed)

Works on **macOS and Linux**. (Windows: install [WSL](https://learn.microsoft.com/windows/wsl/install) first, then follow the Linux path inside it.)

> **Even easier:** paste this page's link into [Claude](https://claude.ai) (or any AI assistant) and say
> *"walk me through setting this up"* — it will guide you one step at a time and answer questions along the
> way. If you use [Claude Code](https://claude.com/claude-code) in a terminal, it can do the whole setup for you.

**Step 1 — Download the app.** Open the Terminal app and paste:

```bash
git clone https://github.com/robertarthurjackson/nfl-bet-tracker.git
cd nfl-bet-tracker
```

(No git? On GitHub click **Code → Download ZIP**, unzip it, then `cd` into the folder.)

**Step 2 — Get your free odds key (2 minutes, optional).**
The app needs a live feed of betting odds. [The Odds API](https://the-odds-api.com) gives anyone a free
allowance — 500 updates a month, which is plenty — think of the key as a library card for odds data.

1. Go to the-odds-api.com and click **Get API Key**
2. Enter your email and pick the **free** plan — no credit card
3. They send you a key that looks like `3268eeb…` — copy it, the next step asks for it

*No key yet? Skip this — the app runs in demo mode with realistic fake odds, and you can add a key any time.*

**Step 3 — Run one command:**

```bash
./setup.sh
```

It checks for the two tools it needs (and installs them if you have [Homebrew](https://brew.sh)), builds
everything, asks for your key (paste it, or press Enter for demo mode), and starts the app.

**That's it.** Open **http://localhost:8000** in your browser — that's your own copy. Your bets, bankroll
and key stay on your computer; nothing is uploaded anywhere. Stop it with Ctrl+C, start it again any time
with `./run.sh`, and re-run `./setup.sh` whenever you want to add or change the key.

### For developers

```bash
cd api
uv venv -p 3.12 .venv && uv pip install -e ".[dev]"
cp .env.example .env            # add ODDS_API_KEY when you have one (free tier: 500 credits/mo)
.venv/bin/python -m pytest -q   # 15 tests

cd ../web
npm install
npm run build                   # -> web/dist, served by the API at /

cd ..
./run.sh                        # API + SPA on http://localhost:8000
```

Dev loop: `./run.sh api` (backend only, auto-reload) and in another terminal `cd web && npm run dev`
(Vite on :5173, proxies `/api` to :8000). `VITE_MOCK=1 npm run dev` runs the UI on built-in mock data.

**Without an API key** the app runs in *demo mode*: odds are synthesized from the nflverse consensus
line for the current week with realistic book-to-book noise, so every screen works. Snapshots cost 0 credits.

## Credits (free tier)

One request costs `markets × ceil(books/10)`. Tiers: **sharp** = Pinnacle, ML+spread (2 credits);
**soft** = enabled bettable books, 3 markets (3 credits per 10 books); **full** = both (~6).
Default schedule (America/Edmonton): Tue openers → Wed soft checks → Thu/Fri hourly sharp pulse with
soft checks whenever Pinnacle moves → Sat full → closing snapshots before every kickoff window (Thu/Sun×3/Mon).
Closing snapshots ignore the weekly budget (CLV is never sacrificed). ≈ 115 credits/week ≈ 500/month.
Adjust `credit_budget_per_week` in Settings; the scheduler skips non-closing runs when the budget is spent.

## CLI

```bash
cd api
.venv/bin/python -m nflbet.cli snapshot full          # one snapshot now (add --force to ignore budget)
.venv/bin/python -m nflbet.cli discover-books         # ~6 credits: reconcile registry keys with the feed
.venv/bin/python -m nflbet.cli maintenance            # refresh results, grade bets, fill closing lines
.venv/bin/python -m nflbet.cli backtest               # favourites-by-price table
```

Run `discover-books` once after adding your key: the registry's Canadian keys (bet365, Sports
Interaction, BET99, PointsBet, PlayNow) are best guesses at The Odds API's naming and are marked unverified.

## Where things live

- `api/nflbet/engine/` — pure math, fully unit-tested: `odds.py`, `devig.py`, `kelly.py`, `margins.py` (key numbers), `clv.py`
- `api/nflbet/services/` — `snapshots.py` (tiered polling + budget), `board.py` (fair prices, EV, Kelly rows), `bets.py` (ledger, grading, CLV), `forecasts.py` (shadow forecasts + Brier scoring)
- `api/nflbet/backtest/favorites.py` — moneyline favourites by price bucket, spread favourites by size
- `api/nflbet/scheduler.py` — cron schedule; `api/nflbet/main.py` — routes
- `api/data/nflbet.db` — your data (snapshots, bets, ledger). Back it up.

## Practical notes

- AGLC books geolocate every wager: bet from Alberta. PlayNow requires BC residency and presence in BC.
- Favourites tend to price better Thu/Fri than Sunday; dogs the reverse.
- Keep volume modest and stakes round: the books that limit are the same brands everywhere.
