import type {
  Bankroll, BankrollAdjust, Bet, BetCreate, BetPatch, Board, Book, BacktestFavorites,
  BacktestKeyNumbers, ClvReport, Forecast, ForecastCreate, ForecastScore, Game, Health,
  HistoryPoint, Market, MethodDoc, Opportunity, Settings, Side, SnapshotRun, SnapshotStatus,
  SnapshotTier,
} from './types'

/**
 * The single API surface used by the UI. Mutations resolve to void: the pages
 * re-fetch the affected resource afterwards, so the contract does not need to
 * pin down mutation response bodies (it doesn't).
 */
export interface Api {
  health(): Promise<Health>

  getSettings(): Promise<Settings>
  putSettings(s: Settings): Promise<void>

  getBoard(week?: number): Promise<Board>
  getOpportunities(minEv: number): Promise<Opportunity[]>

  getGames(week?: number): Promise<Game[]>
  getHistory(gameId: string, market: Market, side: Side): Promise<HistoryPoint[]>

  getBets(): Promise<Bet[]>
  createBet(b: BetCreate): Promise<void>
  patchBet(id: number, patch: BetPatch): Promise<void>
  deleteBet(id: number): Promise<void>

  getBankroll(): Promise<Bankroll>
  adjustBankroll(a: BankrollAdjust): Promise<void>

  getClv(): Promise<ClvReport>

  getForecasts(): Promise<Forecast[]>
  createForecast(f: ForecastCreate): Promise<void>
  deleteForecast(id: number): Promise<void>
  getForecastScore(): Promise<ForecastScore>

  getBacktestFavorites(from?: number, to?: number): Promise<BacktestFavorites>
  getBacktestKeyNumbers(): Promise<BacktestKeyNumbers>

  getBooks(): Promise<Book[]>
  putBook(key: string, enabled: boolean): Promise<void>

  runSnapshot(tier: SnapshotTier): Promise<SnapshotRun>
  getSnapshotStatus(): Promise<SnapshotStatus>

  getMethod(): Promise<MethodDoc>
}

export const USE_MOCK = import.meta.env.VITE_MOCK === '1'

// Both implementations are imported eagerly so the mock stays type-checked;
// the bundler drops the unused branch only in mock builds, which is fine for
// a personal tool (the mock module is a few KB).
import { realApi, ApiError } from './client'
import { mockApi } from './mock'

export const api: Api = USE_MOCK ? mockApi : realApi
export { ApiError }
export * from './types'
