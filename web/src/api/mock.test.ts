/**
 * Validates that the mock fixtures match the shapes in docs/API.md.
 * The key lists below are transcribed from the contract, not from the types,
 * so a drift in either direction fails the test.
 */
import { describe, expect, it } from 'vitest'
import { mockApi } from './mock'

const keys = (o: unknown) => Object.keys(o as Record<string, unknown>).sort()
const expectKeys = (o: unknown, expected: string[]) => expect(keys(o)).toEqual([...expected].sort())

const MARKET_ROW = [
  'market', 'side', 'book', 'book_name', 'jurisdiction', 'line', 'price_american', 'price_decimal',
  'implied_p', 'fair_p', 'ev_pct', 'kelly', 'is_best_price', 'is_stale_candidate', 'last_update',
]
const KELLY = [
  'full_fraction', 'fraction_used', 'price_adjust', 'recommended_pct', 'recommended_stake',
  'capped', 'cap_reason',
]
const BET = [
  'id', 'placed_at', 'game_id', 'home', 'away', 'kickoff', 'week', 'book', 'book_name', 'market',
  'side', 'line', 'price_american', 'price_decimal', 'stake', 'to_win', 'fair_p_at_bet',
  'ev_pct_at_bet', 'kelly_fraction_used', 'trigger', 'note', 'result', 'profit', 'closing_line',
  'closing_price', 'closing_fair_p', 'clv_points', 'clv_prob', 'clv_direction',
]
const MARKETS = ['h2h', 'spreads', 'totals']
const SIDES = ['home', 'away', 'over', 'under']
const RESULTS = [null, 'win', 'loss', 'push', 'void']
const TRIGGERS = ['manual', 'stale', 'threshold']
const JURISDICTIONS = ['AB', 'BC', 'reference']

describe('health', () => {
  it('matches the contract', async () => {
    expectKeys(await mockApi.health(), ['ok', 'season', 'week', 'api_key_set'])
  })
})

describe('settings', () => {
  it('matches the contract', async () => {
    const s = await mockApi.getSettings()
    expectKeys(s, [
      'season', 'bankroll_starting', 'ev_threshold_pct', 'devig_method', 'sharp_book', 'kelly',
      'credit_budget_per_week', 'api_key_set',
    ])
    expectKeys(s.kelly, [
      'mode', 'fixed_fraction', 'schedule', 'price_sensitivity_adjust', 'max_bet_pct',
      'max_open_exposure_pct',
    ])
    expectKeys(s.kelly.schedule[0], ['from_week', 'to_week', 'fraction'])
  })
})

describe('board', () => {
  it('matches the contract and includes the required slate', async () => {
    const b = await mockApi.getBoard(1)
    expectKeys(b, ['season', 'week', 'fetched_at', 'credits', 'kelly_fraction_this_week', 'games'])
    expectKeys(b.credits, ['remaining', 'used_month', 'budget_week', 'used_week'])
    expect(b.season).toBe(2026)
    expect(b.week).toBe(1)
    expect(b.games.length).toBeGreaterThanOrEqual(5)

    const g = b.games[0]
    expectKeys(g, ['game_id', 'kickoff', 'week', 'home', 'away', 'home_name', 'away_name', 'fair', 'markets'])
    expectKeys(g.fair, ['source', 'updated_at', 'home_ml_p', 'away_ml_p', 'fair_spread', 'fair_total'])

    for (const game of b.games) {
      expect(game.markets.length).toBeGreaterThan(0)
      for (const row of game.markets) {
        expectKeys(row, MARKET_ROW)
        expectKeys(row.kelly, KELLY)
        expect(MARKETS).toContain(row.market)
        expect(SIDES).toContain(row.side)
        expect(JURISDICTIONS).toContain(row.jurisdiction)
        expect(typeof row.price_american).toBe('number')
        expect(Math.abs(row.price_american)).toBeGreaterThanOrEqual(100)
        expect(row.implied_p).toBeGreaterThan(0)
        expect(row.implied_p).toBeLessThan(1)
        expect(typeof row.last_update).toBe('string')
        expect(Number.isNaN(Date.parse(row.last_update))).toBe(false)
        if (row.market === 'h2h') expect(row.line).toBeNull()
        else expect(typeof row.line).toBe('number')
      }
    }
  })

  it('has CLE @ JAX priced around JAX -400 / -7.5', async () => {
    const b = await mockApi.getBoard(1)
    const g = b.games.find((x) => x.away === 'CLE' && x.home === 'JAX')
    expect(g).toBeTruthy()
    const ml = g!.markets.filter((r) => r.market === 'h2h' && r.side === 'home')
    const prices = ml.map((r) => r.price_american)
    expect(Math.min(...prices)).toBeLessThan(-250)
    expect(Math.max(...prices)).toBeLessThan(0)
    const spreads = g!.markets.filter((r) => r.market === 'spreads' && r.side === 'home')
    for (const s of spreads) expect(s.line!).toBeLessThan(-5)
    expect(spreads.some((s) => s.line === -7.5)).toBe(true)
  })

  it('covers every required book, including a BC book and a reference book', async () => {
    const b = await mockApi.getBoard(1)
    const books = new Set(b.games[0].markets.map((r) => r.book))
    for (const k of ['pinnacle', 'bet365', 'fanduel', 'draftkings', 'betmgm', 'caesars', 'betrivers', 'thescore', 'playnow']) {
      expect(books.has(k)).toBe(true)
    }
    const rows = b.games[0].markets
    expect(rows.some((r) => r.jurisdiction === 'reference' && r.book === 'pinnacle')).toBe(true)
    expect(rows.some((r) => r.jurisdiction === 'BC' && r.book === 'playnow')).toBe(true)
  })

  it('marks exactly one best price per market and side', async () => {
    const b = await mockApi.getBoard(1)
    for (const g of b.games) {
      for (const m of MARKETS) {
        for (const s of SIDES) {
          const group = g.markets.filter((r) => r.market === m && r.side === s)
          if (group.length === 0) continue
          expect(group.filter((r) => r.is_best_price).length).toBe(1)
        }
      }
    }
  })
})

describe('opportunities', () => {
  it('matches MarketRow plus the game fields, sorted by EV desc', async () => {
    const rows = await mockApi.getOpportunities(2)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expectKeys(r, [...MARKET_ROW, 'game_id', 'home', 'away', 'kickoff', 'week', 'trigger'])
      expect(TRIGGERS).toContain(r.trigger)
      expect(r.ev_pct!).toBeGreaterThanOrEqual(2)
    }
    const evs = rows.map((r) => r.ev_pct!)
    expect([...evs].sort((a, b) => b - a)).toEqual(evs)
  })
})

describe('games and history', () => {
  it('matches the contract', async () => {
    const games = await mockApi.getGames(1)
    expectKeys(games[0], [
      'game_id', 'week', 'kickoff', 'home', 'away', 'home_name', 'away_name', 'home_score',
      'away_score', 'status',
    ])
    expect(['scheduled', 'final']).toContain(games[0].status)

    const hist = await mockApi.getHistory(games[0].game_id, 'spreads', 'home')
    expect(hist.length).toBeGreaterThan(0)
    expectKeys(hist[0], ['captured_at', 'book', 'line', 'price_american'])
    const times = hist.map((h) => Date.parse(h.captured_at))
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
})

describe('bets', () => {
  it('matches the contract, newest first', async () => {
    const bets = await mockApi.getBets()
    expect(bets.length).toBeGreaterThan(0)
    for (const b of bets) {
      expectKeys(b, BET)
      expect(MARKETS).toContain(b.market)
      expect(SIDES).toContain(b.side)
      expect(RESULTS).toContain(b.result)
      expect(TRIGGERS).toContain(b.trigger)
      expect([null, 'toward', 'against', 'flat']).toContain(b.clv_direction)
    }
    const placed = bets.map((b) => Date.parse(b.placed_at))
    expect([...placed].sort((a, b) => b - a)).toEqual(placed)
  })

  it('POST / PATCH / DELETE mutate the in-memory state', async () => {
    const before = await mockApi.getBets()
    await mockApi.createBet({
      game_id: '2026-W1-CLE-JAX', book: 'bet365', market: 'spreads', side: 'home', line: -7,
      price_american: -110, stake: 65, fair_p_at_bet: 0.548, ev_pct_at_bet: 4.6,
      kelly_fraction_used: 0.25, trigger: 'manual', note: 'test',
    })
    const after = await mockApi.getBets()
    expect(after.length).toBe(before.length + 1)
    const created = after.find((b) => b.note === 'test')!
    expectKeys(created, BET)
    expect(created.result).toBeNull()
    expect(created.profit).toBeNull()
    expect(created.home).toBe('JAX')
    expect(created.price_decimal).toBeCloseTo(1.909, 2)
    expect(created.to_win).toBeCloseTo(59.1, 1)

    await mockApi.patchBet(created.id, { result: 'win' })
    const graded = (await mockApi.getBets()).find((b) => b.id === created.id)!
    expect(graded.result).toBe('win')
    expect(graded.profit).toBeCloseTo(59.1, 1)

    await mockApi.deleteBet(created.id)
    expect((await mockApi.getBets()).length).toBe(before.length)
  })
})

describe('bankroll', () => {
  it('matches the contract and reacts to adjustments', async () => {
    const b = await mockApi.getBankroll()
    expectKeys(b, ['starting', 'current', 'open_exposure', 'open_exposure_pct', 'summary', 'history'])
    expectKeys(b.summary, ['n_bets', 'wins', 'losses', 'pushes', 'staked', 'profit', 'roi_pct'])
    for (const h of b.history) {
      expect(keys(h).includes('at')).toBe(true)
      expect(keys(h).includes('balance')).toBe(true)
      expect(keys(h).includes('event')).toBe(true)
      expect(keys(h).includes('amount')).toBe(true)
    }
    expect(b.summary.wins + b.summary.losses + b.summary.pushes).toBe(b.summary.n_bets)

    await mockApi.adjustBankroll({ amount: 500, note: 'deposit' })
    const after = await mockApi.getBankroll()
    expect(after.current).toBeCloseTo(b.current + 500, 2)
    await mockApi.adjustBankroll({ amount: -500, note: 'undo' })
  })
})

describe('clv', () => {
  it('matches the contract', async () => {
    const r = await mockApi.getClv()
    expectKeys(r, ['summary', 'by_book', 'by_trigger', 'bets'])
    expectKeys(r.summary, ['n_closed', 'avg_clv_prob', 'avg_clv_points', 'pct_toward', 'pct_against', 'pct_flat'])
    expectKeys(r.by_book[0], ['book', 'book_name', 'n', 'avg_clv_prob', 'pct_toward', 'stale_hit_rate'])
    expectKeys(r.by_trigger[0], ['trigger', 'n', 'avg_clv_prob', 'pct_toward'])
    for (const b of r.bets) {
      expectKeys(b, BET)
      expect(b.closing_fair_p).not.toBeNull()
    }
    expect(r.summary.n_closed).toBe(r.bets.length)
  })
})

describe('forecasts', () => {
  it('matches the contract and POST fills market_p_at_time', async () => {
    const list = await mockApi.getForecasts()
    for (const f of list) {
      expectKeys(f, [
        'id', 'created_at', 'game_id', 'home', 'away', 'kickoff', 'week', 'market', 'side', 'line',
        'my_p', 'market_p_at_time', 'outcome', 'note',
      ])
      expect([null, 0, 1]).toContain(f.outcome)
    }

    await mockApi.createForecast({ game_id: '2026-W1-SF-SEA', market: 'h2h', side: 'home', line: null, my_p: 0.5, note: 'unit-test' })
    const after = await mockApi.getForecasts()
    const created = after.find((f) => f.note === 'unit-test')!
    expect(created.market_p_at_time).not.toBeNull()
    expect(created.outcome).toBeNull()
    await mockApi.deleteForecast(created.id)
    expect((await mockApi.getForecasts()).length).toBe(list.length)
  })

  it('scores against the contract shape', async () => {
    const s = await mockApi.getForecastScore()
    expectKeys(s, [
      'n_scored', 'brier_mine', 'brier_market', 'log_loss_mine', 'log_loss_market', 'calibration',
      'verdict',
    ])
    expect(['market', 'mine', 'insufficient']).toContain(s.verdict)
    if (s.calibration.length > 0) {
      expectKeys(s.calibration[0], ['bucket', 'n', 'predicted_mine', 'predicted_market', 'actual'])
    }
  })
})

describe('backtests', () => {
  it('matches the contract', async () => {
    const f = await mockApi.getBacktestFavorites()
    expectKeys(f, ['from', 'to', 'n_games', 'buckets', 'note'])
    expectKeys(f.buckets[0], ['bucket', 'n', 'wins', 'win_pct', 'implied_p', 'roi_pct', 'units'])

    const k = await mockApi.getBacktestKeyNumbers()
    expectKeys(k, ['n_games', 'margins', 'half_point_value'])
    expectKeys(k.margins[0], ['margin', 'freq'])
    expectKeys(k.half_point_value[0], ['from', 'to', 'delta_p'])
    for (let m = 1; m <= 14; m++) expect(k.margins.some((x) => x.margin === m)).toBe(true)
  })
})

describe('books', () => {
  it('matches the contract and PUT toggles enabled', async () => {
    const books = await mockApi.getBooks()
    expectKeys(books[0], ['key', 'name', 'region', 'jurisdiction', 'enabled', 'is_sharp'])
    for (const b of books) expect(JURISDICTIONS).toContain(b.jurisdiction)
    expect(books.some((b) => b.is_sharp && b.jurisdiction === 'reference')).toBe(true)

    await mockApi.putBook('caesars', false)
    expect((await mockApi.getBooks()).find((b) => b.key === 'caesars')!.enabled).toBe(false)
    await mockApi.putBook('caesars', true)
    expect((await mockApi.getBooks()).find((b) => b.key === 'caesars')!.enabled).toBe(true)
  })
})

describe('snapshots', () => {
  it('matches the contract and spends credits', async () => {
    const before = await mockApi.getSnapshotStatus()
    expectKeys(before, ['credits', 'last_runs', 'schedule', 'scheduler_running'])
    expectKeys(before.credits, ['remaining', 'used_month', 'budget_week', 'used_week'])
    expectKeys(before.last_runs[0], ['tier', 'at', 'credits_used', 'rows', 'ok', 'error'])
    expectKeys(before.schedule[0], ['tier', 'cron', 'desc'])

    const run = await mockApi.runSnapshot('sharp')
    expectKeys(run, ['ok', 'tier', 'credits_used', 'credits_remaining', 'rows'])
    const after = await mockApi.getSnapshotStatus()
    expect(after.credits.remaining).toBe(before.credits.remaining - run.credits_used)
  })
})

describe('method', () => {
  it('returns markdown', async () => {
    const m = await mockApi.getMethod()
    expectKeys(m, ['markdown'])
    expect(m.markdown.length).toBeGreaterThan(200)
  })
})
