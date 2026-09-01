/**
 * In-memory mock API used when VITE_MOCK=1.
 * Every shape here is built to match docs/API.md exactly; POSTs/PATCHes mutate
 * the in-memory state so bet logging, grading and bankroll moves are exercisable.
 */
import type { Api } from './index'
import type {
  Bankroll, BankrollAdjust, BankrollHistoryPoint, Bet, BetCreate, BetPatch, Board, BoardGame,
  Book, BacktestFavorites, BacktestKeyNumbers, ClvByBook, ClvByTrigger, ClvReport, Forecast,
  ForecastCreate, ForecastScore, Game, Health, HistoryPoint, Jurisdiction, KellyInfo, Market,
  MarketRow, MethodDoc, Opportunity, Settings, Side, SnapshotRun, SnapshotStatus, SnapshotTier,
} from './types'

/* ------------------------------------------------------------------ math */

export const toDecimal = (american: number): number =>
  american > 0 ? 1 + american / 100 : 1 + 100 / -american

export const toAmerican = (decimal: number): number =>
  decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

// Abramowitz & Stegun 7.1.26 error function -> standard normal CDF.
function erf(x: number): number {
  const s = x < 0 ? -1 : 1
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))

const MARGIN_SD = 13.2
const TOTAL_SD = 10.4

/* --------------------------------------------------------------- fixtures */

interface BookDef { key: string; name: string; region: string; jurisdiction: Jurisdiction; is_sharp: boolean; enabled: boolean }

const BOOKS: BookDef[] = [
  { key: 'pinnacle', name: 'Pinnacle', region: 'eu', jurisdiction: 'reference', is_sharp: true, enabled: true },
  { key: 'bet365', name: 'bet365', region: 'us', jurisdiction: 'AB', is_sharp: false, enabled: true },
  { key: 'fanduel', name: 'FanDuel', region: 'us', jurisdiction: 'AB', is_sharp: false, enabled: true },
  { key: 'draftkings', name: 'DraftKings', region: 'us', jurisdiction: 'AB', is_sharp: false, enabled: true },
  { key: 'betmgm', name: 'BetMGM', region: 'us', jurisdiction: 'AB', is_sharp: false, enabled: true },
  { key: 'caesars', name: 'Caesars', region: 'us', jurisdiction: 'AB', is_sharp: false, enabled: true },
  { key: 'betrivers', name: 'BetRivers', region: 'us', jurisdiction: 'AB', is_sharp: false, enabled: true },
  { key: 'thescore', name: 'theScore Bet', region: 'us', jurisdiction: 'AB', is_sharp: false, enabled: true },
  { key: 'playnow', name: 'PlayNow (BCLC)', region: 'ca', jurisdiction: 'BC', is_sharp: false, enabled: true },
]

interface GameDef {
  game_id: string
  kickoff: string
  home: string; away: string; home_name: string; away_name: string
  home_ml_p: number
  fair_spread: number   // home spread, negative = home favourite
  fair_total: number
  // per-book deviation seeds
  seed: number
}

const GAMES: GameDef[] = [
  {
    game_id: '2026-W1-CLE-JAX', kickoff: '2026-09-13T17:00:00Z',
    home: 'JAX', away: 'CLE', home_name: 'Jacksonville Jaguars', away_name: 'Cleveland Browns',
    home_ml_p: 0.771, fair_spread: -7.3, fair_total: 41.5, seed: 11,
  },
  {
    game_id: '2026-W1-DAL-PHI', kickoff: '2026-09-11T00:20:00Z',
    home: 'PHI', away: 'DAL', home_name: 'Philadelphia Eagles', away_name: 'Dallas Cowboys',
    home_ml_p: 0.631, fair_spread: -3.4, fair_total: 47.5, seed: 3,
  },
  {
    game_id: '2026-W1-KC-LAC', kickoff: '2026-09-13T20:25:00Z',
    home: 'LAC', away: 'KC', home_name: 'Los Angeles Chargers', away_name: 'Kansas City Chiefs',
    home_ml_p: 0.417, fair_spread: 2.9, fair_total: 45.5, seed: 7,
  },
  {
    game_id: '2026-W1-GB-DET', kickoff: '2026-09-13T17:00:00Z',
    home: 'DET', away: 'GB', home_name: 'Detroit Lions', away_name: 'Green Bay Packers',
    home_ml_p: 0.548, fair_spread: -1.4, fair_total: 49.5, seed: 5,
  },
  {
    game_id: '2026-W1-NYJ-BUF', kickoff: '2026-09-13T17:00:00Z',
    home: 'BUF', away: 'NYJ', home_name: 'Buffalo Bills', away_name: 'New York Jets',
    home_ml_p: 0.796, fair_spread: -8.6, fair_total: 43.5, seed: 13,
  },
  {
    game_id: '2026-W1-SF-SEA', kickoff: '2026-09-14T00:05:00Z',
    home: 'SEA', away: 'SF', home_name: 'Seattle Seahawks', away_name: 'San Francisco 49ers',
    home_ml_p: 0.455, fair_spread: 1.6, fair_total: 44.0, seed: 17,
  },
]

/** Deterministic pseudo-random in [0,1) so the mock is stable across reloads. */
function rnd(...parts: (string | number)[]): number {
  let h = 2166136261
  const s = parts.join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

const FETCHED_AT = '2026-09-09T15:40:00Z'
const now = () => new Date().toISOString()

/* ------------------------------------------------------------ fair prices */

function fairSpreadP(def: GameDef, side: Side, line: number): number {
  // margin (home - away) ~ N(-fair_spread, sd)
  const mu = -def.fair_spread
  if (side === 'home') return 1 - phi((-line - mu) / MARGIN_SD)
  return phi((line - mu) / MARGIN_SD)
}

function fairTotalP(def: GameDef, side: Side, line: number): number {
  const z = (line - def.fair_total) / TOTAL_SD
  return side === 'over' ? 1 - phi(z) : phi(z)
}

function fairP(def: GameDef, market: Market, side: Side, line: number | null): number {
  if (market === 'h2h') return side === 'home' ? def.home_ml_p : 1 - def.home_ml_p
  if (market === 'spreads') return fairSpreadP(def, side, line ?? 0)
  return fairTotalP(def, side, line ?? def.fair_total)
}

/* ------------------------------------------------------------------ kelly */

function kellyFor(fair_p: number, decimal: number, fractionUsed: number, priceAdjust: boolean, bankroll: number, maxBetPct: number): KellyInfo {
  const b = decimal - 1
  const full = Math.max(0, (b * fair_p - (1 - fair_p)) / b)
  const american = toAmerican(decimal)
  const adjust = priceAdjust ? (american <= -250 ? 0.7 : american <= -150 ? 0.85 : american >= 250 ? 0.8 : 1.0) : 1.0
  let pct = full * fractionUsed * adjust * 100
  let capped = false
  let cap_reason: string | null = null
  if (pct > maxBetPct) { pct = maxBetPct; capped = true; cap_reason = `max_bet_pct ${maxBetPct}%` }
  return {
    full_fraction: round(full, 4),
    fraction_used: fractionUsed,
    price_adjust: round(adjust, 2),
    recommended_pct: round(pct, 2),
    recommended_stake: round((pct / 100) * bankroll, 2),
    capped,
    cap_reason,
  }
}

/* ------------------------------------------------------------- market rows */

const SPREAD_STEPS = [-1, -0.5, 0, 0, 0, 0.5, 1]
const TOTAL_STEPS = [-1, -0.5, 0, 0, 0, 0.5, 1]

/**
 * How far a book is off the fair number. Most rows carry vig (negative EV); a
 * minority are "off-market" — the book has not followed the sharp move — which
 * is where the +EV rows and the stale candidates come from.
 */
function bookEdge(def: GameDef, book: BookDef, market: Market, side: Side): { off: number; stale: boolean } {
  if (book.is_sharp) return { off: 0.018, stale: false }
  const g = rnd(book.key, def.game_id, market, side, 'g')
  if (g > 0.86) {
    // hasn't moved with the market: price sits below fair -> positive EV
    return { off: -(0.02 + (g - 0.86) * 0.36), stale: g > 0.945 }
  }
  return { off: 0.028 + rnd(def.seed, book.key, market, side) * 0.03, stale: false }
}

function priceFor(def: GameDef, book: BookDef, market: Market, side: Side, line: number | null): number {
  const p = fairP(def, market, side, line)
  const { off } = bookEdge(def, book, market, side)
  const noise = (rnd(book.key, def.game_id, market, side, 'n') - 0.5) * 0.012
  const implied = Math.min(0.965, Math.max(0.02, p * (1 + off) + noise))
  const american = toAmerican(1 / implied)
  // snap to a plausible tick
  if (Math.abs(american) >= 300) return Math.round(american / 10) * 10
  return Math.round(american / 5) * 5
}

function lineFor(def: GameDef, book: BookDef, market: Market): number | null {
  if (market === 'h2h') return null
  const base = market === 'spreads' ? def.fair_spread : def.fair_total
  const snapped = Math.round(base * 2) / 2
  if (book.is_sharp) return snapped
  const steps = market === 'spreads' ? SPREAD_STEPS : TOTAL_STEPS
  const idx = Math.floor(rnd(book.key, def.game_id, market, 'l') * steps.length)
  return round(snapped + steps[idx], 1)
}

function buildRows(def: GameDef, settings: Settings, bankroll: number, fractionUsed: number): MarketRow[] {
  const rows: MarketRow[] = []
  const combos: [Market, Side][] = [
    ['h2h', 'home'], ['h2h', 'away'],
    ['spreads', 'home'], ['spreads', 'away'],
    ['totals', 'over'], ['totals', 'under'],
  ]
  for (const book of BOOKS.filter((b) => b.enabled)) {
    for (const [market, side] of combos) {
      const rawLine = lineFor(def, book, market)
      const line = market === 'spreads' && rawLine !== null && side === 'away' ? round(-rawLine, 1) : rawLine
      const american = priceFor(def, book, market, side, line)
      const decimal = round(toDecimal(american), 3)
      const implied_p = round(1 / decimal, 4)
      const fair_p = round(fairP(def, market, side, line), 4)
      const ev_pct = round((fair_p * (decimal - 1) - (1 - fair_p)) * 100, 2)
      const stale = bookEdge(def, book, market, side).stale
      const minsAgo = Math.floor(rnd(book.key, def.game_id, market, side, 't') * (stale ? 260 : 40)) + 2
      rows.push({
        market, side,
        book: book.key, book_name: book.name, jurisdiction: book.jurisdiction,
        line,
        price_american: american,
        price_decimal: decimal,
        implied_p,
        fair_p,
        ev_pct,
        kelly: kellyFor(fair_p, decimal, fractionUsed, settings.kelly.price_sensitivity_adjust, bankroll, settings.kelly.max_bet_pct),
        is_best_price: false,
        is_stale_candidate: stale,
        last_update: new Date(Date.parse(FETCHED_AT) - minsAgo * 60_000).toISOString(),
      })
    }
  }
  // best price per market+side = highest EV (falls back to best decimal price)
  for (const [market, side] of combos) {
    const group = rows.filter((r) => r.market === market && r.side === side)
    let best = group[0]
    for (const r of group) {
      const a = r.ev_pct ?? (r.price_decimal - 10)
      const b = best.ev_pct ?? (best.price_decimal - 10)
      if (a > b) best = r
    }
    if (best) best.is_best_price = true
  }
  return rows
}

/* ------------------------------------------------------------------ state */

const DEFAULT_SETTINGS: Settings = {
  season: 2026,
  bankroll_starting: 5000,
  ev_threshold_pct: 2.0,
  devig_method: 'power',
  sharp_book: 'pinnacle',
  kelly: {
    mode: 'schedule',
    fixed_fraction: 0.5,
    schedule: [
      { from_week: 1, to_week: 2, fraction: 0.25 },
      { from_week: 3, to_week: 5, fraction: 0.333 },
      { from_week: 6, to_week: 22, fraction: 0.5 },
    ],
    price_sensitivity_adjust: true,
    max_bet_pct: 3.0,
    max_open_exposure_pct: 10.0,
  },
  credit_budget_per_week: 115,
  api_key_set: true,
}

interface LedgerEvent { at: string; event: string; amount: number; bet_id?: number }

interface State {
  settings: Settings
  books: BookDef[]
  bets: Bet[]
  forecasts: Forecast[]
  ledger: LedgerEvent[]
  credits: { remaining: number; used_month: number; budget_week: number; used_week: number }
  last_runs: SnapshotStatus['last_runs']
  nextBetId: number
  nextForecastId: number
}

const CURRENT_WEEK = 1

function kellyFractionForWeek(s: Settings, week: number): number {
  if (s.kelly.mode !== 'schedule') return s.kelly.fixed_fraction
  const row = s.kelly.schedule.find((r) => week >= r.from_week && week <= r.to_week)
  return row ? row.fraction : s.kelly.fixed_fraction
}

const gameById = (id: string) => GAMES.find((g) => g.game_id === id)

function seedBets(): Bet[] {
  const raw: Array<Partial<Bet> & { game_id: string; book: string; market: Market; side: Side; line: number | null; price_american: number; stake: number }> = [
    { game_id: '2026-W1-DAL-PHI', book: 'bet365', market: 'spreads', side: 'home', line: -3.5, price_american: -105, stake: 72, fair_p_at_bet: 0.548, ev_pct_at_bet: 6.9, kelly_fraction_used: 0.25, trigger: 'threshold', note: 'PHI line looked slow to move', result: 'win', closing_line: -4.5, closing_price: -110, closing_fair_p: 0.585 },
    { game_id: '2026-W1-CLE-JAX', book: 'playnow', market: 'totals', side: 'under', line: 42.5, price_american: -110, stake: 55, fair_p_at_bet: 0.539, ev_pct_at_bet: 2.9, kelly_fraction_used: 0.25, trigger: 'stale', note: 'PlayNow slow off the sharp move', result: 'loss', closing_line: 41.5, closing_price: -108, closing_fair_p: 0.502 },
    { game_id: '2026-W1-GB-DET', book: 'fanduel', market: 'h2h', side: 'away', line: null, price_american: 120, stake: 48, fair_p_at_bet: 0.452, ev_pct_at_bet: -0.6, kelly_fraction_used: 0.25, trigger: 'manual', note: 'gut call on GB', result: 'loss', closing_line: null, closing_price: 108, closing_fair_p: 0.471 },
    { game_id: '2026-W1-NYJ-BUF', book: 'draftkings', market: 'spreads', side: 'away', line: 9.5, price_american: -110, stake: 63, fair_p_at_bet: 0.532, ev_pct_at_bet: 1.5, kelly_fraction_used: 0.25, trigger: 'stale', note: '', result: 'push', closing_line: 9.5, closing_price: -112, closing_fair_p: 0.534 },
    { game_id: '2026-W1-KC-LAC', book: 'betmgm', market: 'spreads', side: 'home', line: 3.5, price_american: -108, stake: 80, fair_p_at_bet: 0.556, ev_pct_at_bet: 7.1, kelly_fraction_used: 0.25, trigger: 'threshold', note: 'key number 3', result: 'win', closing_line: 2.5, closing_price: -110, closing_fair_p: 0.521 },
    { game_id: '2026-W1-SF-SEA', book: 'caesars', market: 'totals', side: 'over', line: 43.5, price_american: -105, stake: 44, fair_p_at_bet: 0.519, ev_pct_at_bet: 1.3, kelly_fraction_used: 0.25, trigger: 'manual', note: '', result: 'win', closing_line: 44.5, closing_price: -110, closing_fair_p: 0.487 },
    { game_id: '2026-W1-CLE-JAX', book: 'bet365', market: 'spreads', side: 'home', line: -7.0, price_american: -110, stake: 65, fair_p_at_bet: 0.548, ev_pct_at_bet: 4.6, kelly_fraction_used: 0.25, trigger: 'threshold', note: 'bought the half point off -7.5', result: null, closing_line: null, closing_price: null, closing_fair_p: null },
    { game_id: '2026-W1-NYJ-BUF', book: 'thescore', market: 'h2h', side: 'home', line: null, price_american: -320, stake: 90, fair_p_at_bet: 0.796, ev_pct_at_bet: 4.5, kelly_fraction_used: 0.25, trigger: 'threshold', note: '', result: null, closing_line: null, closing_price: null, closing_fair_p: null },
  ]
  return raw.map((r, i) => {
    const g = gameById(r.game_id)!
    const decimal = round(toDecimal(r.price_american), 3)
    const result = (r.result ?? null) as Bet['result']
    const profit = result === 'win' ? round(r.stake * (decimal - 1), 2)
      : result === 'loss' ? -r.stake
        : result === null ? null : 0
    const clv = computeClv(r.price_american, r.fair_p_at_bet ?? null, r.closing_fair_p ?? null, r.line ?? null, r.closing_line ?? null, r.market, r.side)
    return {
      id: i + 1,
      placed_at: new Date(Date.parse('2026-09-09T16:00:00Z') + i * 3_600_000).toISOString(),
      game_id: r.game_id,
      home: g.home, away: g.away, kickoff: g.kickoff, week: CURRENT_WEEK,
      book: r.book, book_name: BOOKS.find((b) => b.key === r.book)?.name ?? r.book,
      market: r.market, side: r.side, line: r.line,
      price_american: r.price_american, price_decimal: decimal,
      stake: r.stake, to_win: round(r.stake * (decimal - 1), 2),
      fair_p_at_bet: r.fair_p_at_bet ?? null,
      ev_pct_at_bet: r.ev_pct_at_bet ?? null,
      kelly_fraction_used: r.kelly_fraction_used ?? null,
      trigger: r.trigger ?? 'manual',
      note: r.note ?? '',
      result, profit,
      closing_line: r.closing_line ?? null,
      closing_price: r.closing_price ?? null,
      closing_fair_p: r.closing_fair_p ?? null,
      ...clv,
    } satisfies Bet
  })
}

function computeClv(
  _price: number, fairAtBet: number | null, closingFair: number | null,
  line: number | null, closingLine: number | null, market: Market, side: Side,
): Pick<Bet, 'clv_points' | 'clv_prob' | 'clv_direction'> {
  if (closingFair === null || fairAtBet === null) {
    return { clv_points: null, clv_prob: null, clv_direction: null }
  }
  const prob = round(closingFair - fairAtBet, 4)
  let points: number | null = null
  if (line !== null && closingLine !== null) {
    // positive = the market moved through our number in our favour
    const raw = market === 'totals'
      ? (side === 'over' ? closingLine - line : line - closingLine)
      : (side === 'home' ? line - closingLine : closingLine - line)
    points = round(raw, 1)
  }
  const dir: Bet['clv_direction'] = Math.abs(prob) < 0.002 ? 'flat' : prob > 0 ? 'toward' : 'against'
  return { clv_points: points, clv_prob: prob, clv_direction: dir }
}

function seedForecasts(): Forecast[] {
  const raw: Array<Omit<Forecast, 'id' | 'home' | 'away' | 'kickoff' | 'week' | 'created_at'>> = [
    { game_id: '2026-W1-CLE-JAX', market: 'spreads', side: 'away', line: 7.5, my_p: 0.55, market_p_at_time: 0.507, outcome: 1, note: 'CLE front seven travels' },
    { game_id: '2026-W1-DAL-PHI', market: 'h2h', side: 'home', line: null, my_p: 0.68, market_p_at_time: 0.631, outcome: 1, note: '' },
    { game_id: '2026-W1-KC-LAC', market: 'totals', side: 'under', line: 45.5, my_p: 0.58, market_p_at_time: 0.502, outcome: 0, note: 'weather' },
    { game_id: '2026-W1-GB-DET', market: 'spreads', side: 'home', line: -1.5, my_p: 0.53, market_p_at_time: 0.523, outcome: 0, note: '' },
    { game_id: '2026-W1-NYJ-BUF', market: 'h2h', side: 'away', line: null, my_p: 0.26, market_p_at_time: 0.204, outcome: 0, note: 'live dog' },
    { game_id: '2026-W1-SF-SEA', market: 'totals', side: 'over', line: 44.0, my_p: 0.61, market_p_at_time: 0.5, outcome: null, note: 'pace up' },
  ]
  return raw.map((r, i) => {
    const g = gameById(r.game_id)!
    return {
      ...r,
      id: i + 1,
      created_at: new Date(Date.parse('2026-09-08T18:00:00Z') + i * 5_400_000).toISOString(),
      home: g.home, away: g.away, kickoff: g.kickoff, week: CURRENT_WEEK,
    }
  })
}

const state: State = {
  settings: structuredClone(DEFAULT_SETTINGS),
  books: BOOKS.map((b) => ({ ...b })),
  bets: seedBets(),
  forecasts: seedForecasts(),
  ledger: [
    { at: '2026-08-25T12:00:00Z', event: 'start', amount: 0 },
    { at: '2026-09-01T15:30:00Z', event: 'deposit', amount: 250 },
  ],
  credits: { remaining: 412, used_month: 88, budget_week: 115, used_week: 40 },
  last_runs: [
    { tier: 'sharp', at: '2026-09-09T15:00:00Z', credits_used: 2, rows: 312, ok: true, error: null },
    { tier: 'soft', at: '2026-09-09T13:00:00Z', credits_used: 6, rows: 1104, ok: true, error: null },
    { tier: 'full', at: '2026-09-08T20:00:00Z', credits_used: 11, rows: 2480, ok: false, error: 'upstream 502 from odds provider' },
  ],
  nextBetId: 9,
  nextForecastId: 7,
}

/* --------------------------------------------------------------- bankroll */

function buildBankroll(): Bankroll {
  const events: LedgerEvent[] = [...state.ledger]
  for (const b of state.bets) {
    if (b.result !== null && b.profit !== null) {
      events.push({ at: b.placed_at, event: 'bet_settled', amount: b.profit, bet_id: b.id })
    }
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  let balance = state.settings.bankroll_starting
  const history: BankrollHistoryPoint[] = events.map((e) => {
    balance = round(balance + e.amount, 2)
    const point: BankrollHistoryPoint = { at: e.at, balance, event: e.event, amount: round(e.amount, 2) }
    if (e.bet_id !== undefined) point.bet_id = e.bet_id
    return point
  })
  const settled = state.bets.filter((b) => b.result !== null && b.result !== 'void')
  const staked = round(settled.reduce((s, b) => s + b.stake, 0), 2)
  const profit = round(settled.reduce((s, b) => s + (b.profit ?? 0), 0), 2)
  const open = state.bets.filter((b) => b.result === null)
  const open_exposure = round(open.reduce((s, b) => s + b.stake, 0), 2)
  const current = round(balance, 2)
  return {
    starting: state.settings.bankroll_starting,
    current,
    open_exposure,
    open_exposure_pct: current ? round((open_exposure / current) * 100, 2) : 0,
    summary: {
      n_bets: settled.length,
      wins: settled.filter((b) => b.result === 'win').length,
      losses: settled.filter((b) => b.result === 'loss').length,
      pushes: settled.filter((b) => b.result === 'push').length,
      staked, profit,
      roi_pct: staked ? round((profit / staked) * 100, 2) : 0,
    },
    history,
  }
}

/* ------------------------------------------------------------------ board */

function buildBoard(week: number): Board {
  const bankroll = buildBankroll().current
  const fraction = kellyFractionForWeek(state.settings, week)
  const games: BoardGame[] = GAMES.map((def) => ({
    game_id: def.game_id,
    kickoff: def.kickoff,
    week,
    home: def.home, away: def.away, home_name: def.home_name, away_name: def.away_name,
    fair: {
      source: state.settings.sharp_book,
      updated_at: FETCHED_AT,
      home_ml_p: def.home_ml_p,
      away_ml_p: round(1 - def.home_ml_p, 3),
      fair_spread: def.fair_spread,
      fair_total: def.fair_total,
    },
    markets: buildRows(def, state.settings, bankroll, fraction),
  }))
  return {
    season: state.settings.season,
    week,
    fetched_at: FETCHED_AT,
    credits: { ...state.credits },
    kelly_fraction_this_week: fraction,
    games,
  }
}

/* -------------------------------------------------------------------- clv */

function buildClv(): ClvReport {
  const bets = state.bets.filter((b) => b.closing_fair_p !== null && b.clv_prob !== null)
  const n = bets.length
  const share = (pred: (b: Bet) => boolean) => (n ? round(bets.filter(pred).length / n, 3) : 0)
  const avg = (pick: (b: Bet) => number | null) => {
    const vals = bets.map(pick).filter((v): v is number => v !== null)
    return vals.length ? round(vals.reduce((s, v) => s + v, 0) / vals.length, 4) : 0
  }
  const by_book: ClvByBook[] = [...new Set(bets.map((b) => b.book))].map((key) => {
    const rows = bets.filter((b) => b.book === key)
    const staleRows = rows.filter((b) => b.trigger === 'stale')
    return {
      book: key,
      book_name: rows[0].book_name,
      n: rows.length,
      avg_clv_prob: round(rows.reduce((s, b) => s + (b.clv_prob ?? 0), 0) / rows.length, 4),
      pct_toward: round(rows.filter((b) => b.clv_direction === 'toward').length / rows.length, 3),
      stale_hit_rate: staleRows.length
        ? round(staleRows.filter((b) => b.clv_direction === 'toward').length / staleRows.length, 3)
        : null,
    }
  }).sort((a, b) => b.n - a.n)
  const by_trigger: ClvByTrigger[] = (['stale', 'threshold', 'manual'] as const)
    .map((t) => {
      const rows = bets.filter((b) => b.trigger === t)
      return {
        trigger: t,
        n: rows.length,
        avg_clv_prob: rows.length ? round(rows.reduce((s, b) => s + (b.clv_prob ?? 0), 0) / rows.length, 4) : 0,
        pct_toward: rows.length ? round(rows.filter((b) => b.clv_direction === 'toward').length / rows.length, 3) : 0,
      }
    })
    .filter((r) => r.n > 0)
  return {
    summary: {
      n_closed: n,
      avg_clv_prob: avg((b) => b.clv_prob),
      avg_clv_points: avg((b) => b.clv_points),
      pct_toward: share((b) => b.clv_direction === 'toward'),
      pct_against: share((b) => b.clv_direction === 'against'),
      pct_flat: share((b) => b.clv_direction === 'flat'),
    },
    by_book,
    by_trigger,
    bets,
  }
}

/* -------------------------------------------------------------- forecasts */

function buildForecastScore(): ForecastScore {
  const scored = state.forecasts.filter((f) => f.outcome !== null && f.market_p_at_time !== null)
  if (scored.length < 3) {
    return {
      n_scored: scored.length,
      brier_mine: null, brier_market: null, log_loss_mine: null, log_loss_market: null,
      calibration: [], verdict: 'insufficient',
    }
  }
  const brier = (pick: (f: Forecast) => number) =>
    round(scored.reduce((s, f) => s + (pick(f) - (f.outcome as number)) ** 2, 0) / scored.length, 4)
  const logLoss = (pick: (f: Forecast) => number) =>
    round(scored.reduce((s, f) => {
      const p = Math.min(0.999, Math.max(0.001, pick(f)))
      const y = f.outcome as number
      return s - (y * Math.log(p) + (1 - y) * Math.log(1 - p))
    }, 0) / scored.length, 4)

  const buckets = [
    { bucket: '0-30', lo: 0, hi: 0.3 },
    { bucket: '30-50', lo: 0.3, hi: 0.5 },
    { bucket: '50-60', lo: 0.5, hi: 0.6 },
    { bucket: '60-80', lo: 0.6, hi: 0.8 },
    { bucket: '80-100', lo: 0.8, hi: 1.01 },
  ]
  const calibration = buckets.map((b) => {
    const rows = scored.filter((f) => f.my_p >= b.lo && f.my_p < b.hi)
    return {
      bucket: b.bucket,
      n: rows.length,
      predicted_mine: rows.length ? round(rows.reduce((s, f) => s + f.my_p, 0) / rows.length, 3) : 0,
      predicted_market: rows.length ? round(rows.reduce((s, f) => s + (f.market_p_at_time ?? 0), 0) / rows.length, 3) : 0,
      actual: rows.length ? round(rows.reduce((s, f) => s + (f.outcome as number), 0) / rows.length, 3) : 0,
    }
  }).filter((r) => r.n > 0)

  const bm = brier((f) => f.my_p)
  const bk = brier((f) => f.market_p_at_time as number)
  return {
    n_scored: scored.length,
    brier_mine: bm,
    brier_market: bk,
    log_loss_mine: logLoss((f) => f.my_p),
    log_loss_market: logLoss((f) => f.market_p_at_time as number),
    calibration,
    verdict: scored.length < 25 ? 'insufficient' : bm < bk ? 'mine' : 'market',
  }
}

/* -------------------------------------------------------------- backtests */

const FAVORITES: BacktestFavorites = {
  from: 1999, to: 2025, n_games: 6742,
  buckets: [
    { bucket: '-400 or shorter', n: 318, wins: 263, win_pct: 0.827, implied_p: 0.81, roi_pct: -1.2, units: -3.8 },
    { bucket: '-399 to -300', n: 402, wins: 313, win_pct: 0.779, implied_p: 0.766, roi_pct: 0.6, units: 2.4 },
    { bucket: '-299 to -200', n: 731, wins: 522, win_pct: 0.714, implied_p: 0.703, roi_pct: 1.1, units: 8.0 },
    { bucket: '-199 to -150', n: 908, wins: 583, win_pct: 0.642, implied_p: 0.633, roi_pct: 0.4, units: 3.6 },
    { bucket: '-149 to -120', n: 1112, wins: 645, win_pct: 0.58, implied_p: 0.573, roi_pct: -0.9, units: -10.0 },
    { bucket: '-119 to -101', n: 986, wins: 528, win_pct: 0.536, implied_p: 0.535, roi_pct: -1.6, units: -15.8 },
    { bucket: 'pick / dog', n: 2285, wins: 1032, win_pct: 0.452, implied_p: 0.459, roi_pct: -2.3, units: -52.6 },
  ],
  note: 'Flat 1u on the moneyline favorite at the closing price.',
}

const KEYNUMBERS: BacktestKeyNumbers = {
  n_games: 6742,
  margins: [
    { margin: 1, freq: 0.058 }, { margin: 2, freq: 0.041 }, { margin: 3, freq: 0.097 },
    { margin: 4, freq: 0.052 }, { margin: 5, freq: 0.038 }, { margin: 6, freq: 0.056 },
    { margin: 7, freq: 0.073 }, { margin: 8, freq: 0.039 }, { margin: 9, freq: 0.028 },
    { margin: 10, freq: 0.058 }, { margin: 11, freq: 0.027 }, { margin: 12, freq: 0.023 },
    { margin: 13, freq: 0.03 }, { margin: 14, freq: 0.043 },
  ],
  half_point_value: [
    { from: 2.5, to: 3, delta_p: 0.012 },
    { from: 3, to: 3.5, delta_p: 0.045 },
    { from: 3.5, to: 4, delta_p: 0.013 },
    { from: 6.5, to: 7, delta_p: 0.011 },
    { from: 7, to: 7.5, delta_p: 0.034 },
    { from: 7.5, to: 8, delta_p: 0.01 },
    { from: 9.5, to: 10, delta_p: 0.027 },
    { from: 13.5, to: 14, delta_p: 0.021 },
  ],
}

const METHOD_MD = `# Method

How this tracker decides what is worth betting, and how it grades itself afterwards.

## 1. A fair price, not a consensus

Every number on the board is measured against a **fair probability** derived from the
reference book (Pinnacle by default). Pinnacle is used because it takes sharp money and
runs a thin margin, so its price is the closest thing to a market-clearing number.

The two-sided price is de-vigged with the **power method** rather than a naive
normalisation. Naive de-vig spreads the margin evenly and systematically overstates
longshots; the power method solves for \`k\` such that \`sum(p_i^k) = 1\`, which fits the
observed favourite-longshot bias much better.

## 2. Expected value

For an American price converted to decimal \`d\`, with fair probability \`p\`:

\`\`\`
EV% = (p * (d - 1) - (1 - p)) * 100
\`\`\`

A row only appears as an opportunity when EV clears the configured threshold
(default 2.0%). Below that, the edge is inside the noise of the de-vig.

## 3. Staking — fractional Kelly

Full Kelly is the growth-optimal stake **if your probability is exactly right**. It never
is. So the stake is scaled:

\`\`\`
stake% = full_kelly * fraction * price_adjust
\`\`\`

- **fraction** ramps up by week (0.25 early, 0.333, then 0.5) as the sample of graded
  bets grows and the estimate of edge becomes less speculative.
- **price_adjust** trims heavy favourites and long dogs, where de-vig error is largest.
- Every stake is capped at \`max_bet_pct\` of bankroll, and total open exposure at
  \`max_open_exposure_pct\`.

## 4. Stale lines

A row is a **stale candidate** when the sharp book has moved recently and this book has
not followed. That is the single most reliable source of edge for a retail bettor: not
predicting games better than the market, but taking a price the market has already left
behind.

## 5. Grading yourself: CLV first, W/L second

Win/loss over a season of NFL bets is almost pure variance — a few hundred bets is not
enough to distinguish a 2% edge from zero.

**Closing line value** is the leading indicator. If you consistently beat the closing
number, you are getting a real price, and profit follows given enough volume.

- Positive CLV, losing record → variance. Keep going.
- Negative CLV, winning record → luck. The process is not working.

## 6. Shadow forecasts

Opinions that never became bets are logged as **forecasts** and scored against the market
with Brier score and log loss. This answers a question the bankroll cannot: is my read on
a game better than the price, or am I only profiting from stale lines? Those are different
skills, and only one of them scales.
`

/* -------------------------------------------------------------- mock impl */

const delay = <T>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

function opportunitiesFrom(board: Board, minEv: number): Opportunity[] {
  const out: Opportunity[] = []
  for (const g of board.games) {
    for (const r of g.markets) {
      if (r.ev_pct === null || r.ev_pct < minEv) continue
      if (r.jurisdiction === 'reference') continue
      out.push({
        ...r,
        game_id: g.game_id, home: g.home, away: g.away, kickoff: g.kickoff, week: g.week,
        trigger: r.is_stale_candidate ? 'stale' : 'threshold',
      })
    }
  }
  return out.sort((a, b) => (b.ev_pct ?? 0) - (a.ev_pct ?? 0))
}

export const mockApi: Api = {
  health: () => delay<Health>({ ok: true, season: state.settings.season, week: CURRENT_WEEK, api_key_set: state.settings.api_key_set }),

  getSettings: () => delay(structuredClone(state.settings)),
  putSettings: async (s: Settings) => { state.settings = structuredClone(s); await delay(null) },

  getBoard: (week?: number) => delay(buildBoard(week ?? CURRENT_WEEK), 200),
  getOpportunities: (minEv: number) => delay(opportunitiesFrom(buildBoard(CURRENT_WEEK), minEv), 160),

  getGames: (week?: number) => delay<Game[]>(GAMES.map((g) => ({
    game_id: g.game_id, week: week ?? CURRENT_WEEK, kickoff: g.kickoff,
    home: g.home, away: g.away, home_name: g.home_name, away_name: g.away_name,
    home_score: null, away_score: null, status: 'scheduled' as const,
  }))),

  getHistory: (gameId: string, market: Market, side: Side) => {
    const def = gameById(gameId)
    if (!def) return delay<HistoryPoint[]>([])
    const points: HistoryPoint[] = []
    const base = market === 'spreads' ? def.fair_spread : market === 'totals' ? def.fair_total : 0
    for (let i = 12; i >= 0; i--) {
      const drift = (rnd(gameId, market, side, i) - 0.5) * 1.4
      points.push({
        captured_at: new Date(Date.parse(FETCHED_AT) - i * 3_600_000).toISOString(),
        book: state.settings.sharp_book,
        line: market === 'h2h' ? null : round(base + drift, 1),
        price_american: -110 + Math.round((rnd(gameId, market, side, i, 'p') - 0.5) * 20),
      })
    }
    return delay(points)
  },

  getBets: () => delay(structuredClone(state.bets).sort((a, b) => Date.parse(b.placed_at) - Date.parse(a.placed_at))),

  createBet: async (b: BetCreate) => {
    const g = gameById(b.game_id)
    if (!g) throw new Error(`Unknown game_id ${b.game_id}`)
    const decimal = round(toDecimal(b.price_american), 3)
    state.bets.push({
      id: state.nextBetId++,
      placed_at: now(),
      game_id: b.game_id,
      home: g.home, away: g.away, kickoff: g.kickoff, week: CURRENT_WEEK,
      book: b.book, book_name: state.books.find((x) => x.key === b.book)?.name ?? b.book,
      market: b.market, side: b.side, line: b.line,
      price_american: b.price_american, price_decimal: decimal,
      stake: b.stake, to_win: round(b.stake * (decimal - 1), 2),
      fair_p_at_bet: b.fair_p_at_bet, ev_pct_at_bet: b.ev_pct_at_bet,
      kelly_fraction_used: b.kelly_fraction_used, trigger: b.trigger, note: b.note,
      result: null, profit: null,
      closing_line: null, closing_price: null, closing_fair_p: null,
      clv_points: null, clv_prob: null, clv_direction: null,
    })
    await delay(null)
  },

  patchBet: async (id: number, patch: BetPatch) => {
    const bet = state.bets.find((b) => b.id === id)
    if (!bet) throw new Error(`Bet ${id} not found`)
    if (patch.note !== undefined) bet.note = patch.note
    if (patch.stake !== undefined) {
      bet.stake = patch.stake
      bet.to_win = round(patch.stake * (bet.price_decimal - 1), 2)
    }
    if (patch.result !== undefined) {
      bet.result = patch.result
      bet.profit = patch.result === 'win' ? round(bet.stake * (bet.price_decimal - 1), 2)
        : patch.result === 'loss' ? -bet.stake
          : patch.result === null ? null : 0
    }
    await delay(null)
  },

  deleteBet: async (id: number) => {
    state.bets = state.bets.filter((b) => b.id !== id)
    await delay(null)
  },

  getBankroll: () => delay(buildBankroll()),

  adjustBankroll: async (a: BankrollAdjust) => {
    state.ledger.push({ at: now(), event: a.amount >= 0 ? 'deposit' : 'withdrawal', amount: a.amount })
    await delay(null)
  },

  getClv: () => delay(buildClv()),

  getForecasts: () => delay(structuredClone(state.forecasts).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))),

  createForecast: async (f: ForecastCreate) => {
    const g = gameById(f.game_id)
    if (!g) throw new Error(`Unknown game_id ${f.game_id}`)
    state.forecasts.push({
      id: state.nextForecastId++,
      created_at: now(),
      game_id: f.game_id, home: g.home, away: g.away, kickoff: g.kickoff, week: CURRENT_WEEK,
      market: f.market, side: f.side, line: f.line,
      my_p: f.my_p,
      market_p_at_time: round(fairP(g, f.market, f.side, f.line), 4),
      outcome: null,
      note: f.note,
    })
    await delay(null)
  },

  deleteForecast: async (id: number) => {
    state.forecasts = state.forecasts.filter((f) => f.id !== id)
    await delay(null)
  },

  getForecastScore: () => delay(buildForecastScore()),

  getBacktestFavorites: (from?: number, to?: number) =>
    delay({ ...FAVORITES, from: from ?? FAVORITES.from, to: to ?? FAVORITES.to }),
  getBacktestKeyNumbers: () => delay(structuredClone(KEYNUMBERS)),

  getBooks: () => delay<Book[]>(state.books.map((b) => ({
    key: b.key, name: b.name, region: b.region, jurisdiction: b.jurisdiction,
    enabled: b.enabled, is_sharp: b.is_sharp,
  }))),

  putBook: async (key: string, enabled: boolean) => {
    const b = state.books.find((x) => x.key === key)
    if (!b) throw new Error(`Unknown book ${key}`)
    b.enabled = enabled
    const src = BOOKS.find((x) => x.key === key)
    if (src) src.enabled = enabled
    await delay(null)
  },

  runSnapshot: async (tier: SnapshotTier) => {
    const cost = tier === 'sharp' ? 2 : tier === 'soft' ? 6 : 11
    const rows = tier === 'sharp' ? 312 : tier === 'soft' ? 1104 : 2480
    state.credits.remaining -= cost
    state.credits.used_month += cost
    state.credits.used_week += cost
    state.last_runs.unshift({ tier, at: now(), credits_used: cost, rows, ok: true, error: null })
    state.last_runs = state.last_runs.slice(0, 8)
    const res: SnapshotRun = { ok: true, tier, credits_used: cost, credits_remaining: state.credits.remaining, rows }
    return delay(res, 400)
  },

  getSnapshotStatus: () => delay<SnapshotStatus>({
    credits: { ...state.credits },
    last_runs: structuredClone(state.last_runs),
    schedule: [
      { tier: 'sharp', cron: '0 8-20 * * thu,fri', desc: 'Hourly Thu/Fri betting window' },
      { tier: 'soft', cron: '0 9,13,17 * * sat,sun', desc: 'Three times a day on game days' },
      { tier: 'full', cron: '0 7 * * tue', desc: 'Weekly full sweep when the new slate opens' },
    ],
    scheduler_running: true,
  }),

  getMethod: () => delay<MethodDoc>({ markdown: METHOD_MD }),
}

/** Exported for the fixture test. */
export const __mockInternals = { buildBoard, buildBankroll, buildClv, buildForecastScore, state, GAMES, BOOKS }
