/**
 * Types mirroring docs/API.md (NFL Bet Tracker API contract v1).
 * Field names and shapes here must match the contract exactly.
 */

export type Market = 'h2h' | 'spreads' | 'totals'
export type Side = 'home' | 'away' | 'over' | 'under'
export type BetResult = null | 'win' | 'loss' | 'push' | 'void'
export type ClvDirection = 'toward' | 'against' | 'flat' | null
export type Trigger = 'manual' | 'stale' | 'threshold'
export type Jurisdiction = 'AB' | 'BC' | 'reference'

export interface Health {
  ok: boolean
  season: number
  week: number
  api_key_set: boolean
}

export interface KellyScheduleRow {
  from_week: number
  to_week: number
  fraction: number
}

export interface KellySettings {
  mode: string
  fixed_fraction: number
  schedule: KellyScheduleRow[]
  price_sensitivity_adjust: boolean
  max_bet_pct: number
  max_open_exposure_pct: number
}

export interface Settings {
  season: number
  bankroll_starting: number
  ev_threshold_pct: number
  devig_method: string
  sharp_book: string
  kelly: KellySettings
  credit_budget_per_week: number
  api_key_set: boolean
}

export interface Credits {
  remaining: number
  used_month: number
  budget_week: number
  used_week: number
}

export interface FairLine {
  source: string
  updated_at: string
  home_ml_p: number | null
  away_ml_p: number | null
  fair_spread: number | null
  fair_total: number | null
}

export interface KellyInfo {
  full_fraction: number
  fraction_used: number
  price_adjust: number
  recommended_pct: number
  recommended_stake: number
  capped: boolean
  cap_reason: string | null
}

export interface MarketRow {
  market: Market
  side: Side
  book: string
  book_name: string
  jurisdiction: Jurisdiction
  line: number | null
  price_american: number
  price_decimal: number
  implied_p: number
  fair_p: number | null
  ev_pct: number | null
  kelly: KellyInfo
  is_best_price: boolean
  is_stale_candidate: boolean
  last_update: string
}

export interface BoardGame {
  game_id: string
  kickoff: string
  week: number
  home: string
  away: string
  home_name: string
  away_name: string
  fair: FairLine
  markets: MarketRow[]
}

export interface Board {
  season: number
  week: number
  fetched_at: string
  credits: Credits
  kelly_fraction_this_week: number
  games: BoardGame[]
}

export interface Opportunity extends MarketRow {
  game_id: string
  home: string
  away: string
  kickoff: string
  week: number
  trigger: Trigger
}

export interface Game {
  game_id: string
  week: number
  kickoff: string
  home: string
  away: string
  home_name: string
  away_name: string
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'final'
}

export interface HistoryPoint {
  captured_at: string
  book: string
  line: number | null
  price_american: number
}

export interface Bet {
  id: number
  placed_at: string
  game_id: string
  home: string
  away: string
  kickoff: string
  week: number
  book: string
  book_name: string
  market: Market
  side: Side
  line: number | null
  price_american: number
  price_decimal: number
  stake: number
  to_win: number
  fair_p_at_bet: number | null
  ev_pct_at_bet: number | null
  kelly_fraction_used: number | null
  trigger: Trigger
  note: string
  result: BetResult
  profit: number | null
  closing_line: number | null
  closing_price: number | null
  closing_fair_p: number | null
  clv_points: number | null
  clv_prob: number | null
  clv_direction: ClvDirection
}

export interface BetCreate {
  game_id: string
  book: string
  market: Market
  side: Side
  line: number | null
  price_american: number
  stake: number
  fair_p_at_bet: number | null
  ev_pct_at_bet: number | null
  kelly_fraction_used: number | null
  trigger: Trigger
  note: string
}

export interface BetPatch {
  result?: BetResult
  note?: string
  stake?: number
}

export interface BankrollSummary {
  n_bets: number
  wins: number
  losses: number
  pushes: number
  staked: number
  profit: number
  roi_pct: number
}

export interface BankrollHistoryPoint {
  at: string
  balance: number
  event: string
  amount: number
  bet_id?: number
}

export interface Bankroll {
  starting: number
  current: number
  open_exposure: number
  open_exposure_pct: number
  summary: BankrollSummary
  history: BankrollHistoryPoint[]
}

export interface ClvSummary {
  n_closed: number
  avg_clv_prob: number
  avg_clv_points: number
  pct_toward: number
  pct_against: number
  pct_flat: number
}

export interface ClvByBook {
  book: string
  book_name: string
  n: number
  avg_clv_prob: number
  pct_toward: number
  stale_hit_rate: number | null
}

export interface ClvByTrigger {
  trigger: Trigger
  n: number
  avg_clv_prob: number
  pct_toward: number
}

export interface ClvReport {
  summary: ClvSummary
  by_book: ClvByBook[]
  by_trigger: ClvByTrigger[]
  bets: Bet[]
}

export interface Forecast {
  id: number
  created_at: string
  game_id: string
  home: string
  away: string
  kickoff: string
  week: number
  market: Market
  side: Side
  line: number | null
  my_p: number
  market_p_at_time: number | null
  outcome: null | 1 | 0
  note: string
}

export interface ForecastCreate {
  game_id: string
  market: Market
  side: Side
  line: number | null
  my_p: number
  note: string
}

export interface CalibrationRow {
  bucket: string
  n: number
  predicted_mine: number
  predicted_market: number
  actual: number
}

export interface ForecastScore {
  n_scored: number
  brier_mine: number | null
  brier_market: number | null
  log_loss_mine: number | null
  log_loss_market: number | null
  calibration: CalibrationRow[]
  verdict: 'market' | 'mine' | 'insufficient'
}

export interface FavoriteBucket {
  bucket: string
  n: number
  wins: number
  win_pct: number
  implied_p: number
  roi_pct: number
  units: number
}

export interface BacktestFavorites {
  from: number
  to: number
  n_games: number
  buckets: FavoriteBucket[]
  note: string
}

export interface MarginFreq {
  margin: number
  freq: number
}

export interface HalfPointValue {
  from: number
  to: number
  delta_p: number
}

export interface BacktestKeyNumbers {
  n_games: number
  margins: MarginFreq[]
  half_point_value: HalfPointValue[]
}

export interface Book {
  key: string
  name: string
  region: string
  jurisdiction: Jurisdiction
  enabled: boolean
  is_sharp: boolean
}

export type SnapshotTier = 'sharp' | 'soft' | 'full'

export interface SnapshotRun {
  ok: boolean
  tier: SnapshotTier
  credits_used: number
  credits_remaining: number
  rows: number
}

export interface LastRun {
  tier: SnapshotTier
  at: string
  credits_used: number
  rows: number
  ok: boolean
  error: string | null
}

export interface ScheduleRow {
  tier: SnapshotTier
  cron: string
  desc: string
}

export interface SnapshotStatus {
  credits: Credits
  last_runs: LastRun[]
  schedule: ScheduleRow[]
  scheduler_running: boolean
}

export interface MethodDoc {
  markdown: string
}

export interface BankrollAdjust {
  amount: number
  note: string
}
