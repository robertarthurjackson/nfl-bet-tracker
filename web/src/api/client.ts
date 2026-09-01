import type {
  Bankroll, BankrollAdjust, Bet, BetCreate, BetPatch, Board, Book, BacktestFavorites,
  BacktestKeyNumbers, ClvReport, Forecast, ForecastCreate, ForecastScore, Game, Health,
  HistoryPoint, Market, MethodDoc, Opportunity, Settings, Side, SnapshotRun, SnapshotStatus,
  SnapshotTier,
} from './types'
import type { Api } from './index'

/** Error carrying the `{ detail }` message returned by the API on non-2xx. */
export class ApiError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'Network error — is the API running on :8000?')
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body && typeof body.detail === 'string') detail = body.detail
      else if (body && body.detail) detail = JSON.stringify(body.detail)
    } catch {
      /* body was not JSON — keep the status text */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

const get = <T>(p: string) => request<T>(p)
const send = <T>(method: string, p: string, body?: unknown) =>
  request<T>(p, { method, body: body === undefined ? undefined : JSON.stringify(body) })

const qs = (params: Record<string, string | number | undefined>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const realApi: Api = {
  health: () => get<Health>('/health'),

  getSettings: () => get<Settings>('/settings'),
  putSettings: async (s: Settings) => { await send<unknown>('PUT', '/settings', s) },

  getBoard: (week?: number) => get<Board>(`/board${qs({ week })}`),
  getOpportunities: (minEv: number) => get<Opportunity[]>(`/opportunities${qs({ min_ev: minEv })}`),

  getGames: (week?: number) => get<Game[]>(`/games${qs({ week })}`),
  getHistory: (gameId: string, market: Market, side: Side) =>
    get<HistoryPoint[]>(`/games/${encodeURIComponent(gameId)}/history${qs({ market, side })}`),

  getBets: () => get<Bet[]>('/bets'),
  createBet: async (b: BetCreate) => { await send<unknown>('POST', '/bets', b) },
  patchBet: async (id: number, patch: BetPatch) => { await send<unknown>('PATCH', `/bets/${id}`, patch) },
  deleteBet: async (id: number) => { await send<unknown>('DELETE', `/bets/${id}`) },

  getBankroll: () => get<Bankroll>('/bankroll'),
  adjustBankroll: async (a: BankrollAdjust) => { await send<unknown>('POST', '/bankroll/adjust', a) },

  getClv: () => get<ClvReport>('/clv'),

  getForecasts: () => get<Forecast[]>('/forecasts'),
  createForecast: async (f: ForecastCreate) => { await send<unknown>('POST', '/forecasts', f) },
  deleteForecast: async (id: number) => { await send<unknown>('DELETE', `/forecasts/${id}`) },
  getForecastScore: () => get<ForecastScore>('/forecasts/score'),

  getBacktestFavorites: (from?: number, to?: number) =>
    get<BacktestFavorites>(`/backtest/favorites${qs({ from, to })}`),
  getBacktestKeyNumbers: () => get<BacktestKeyNumbers>('/backtest/keynumbers'),

  getBooks: () => get<Book[]>('/books'),
  putBook: async (key: string, enabled: boolean) => {
    await send<unknown>('PUT', `/books/${encodeURIComponent(key)}`, { enabled })
  },

  runSnapshot: (tier: SnapshotTier) => send<SnapshotRun>('POST', `/snapshots/run${qs({ tier })}`),
  getSnapshotStatus: () => get<SnapshotStatus>('/snapshots/status'),

  getMethod: () => get<MethodDoc>('/method'),
}
