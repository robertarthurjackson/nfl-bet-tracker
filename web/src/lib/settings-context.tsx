import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { Settings } from '../api/types'
import { errorMessage } from './useAsync'

interface SettingsCtx {
  settings: Settings | null
  loading: boolean
  error: string | null
  refresh: () => void
  /** EV threshold from settings, with a safe default while settings load. */
  evThreshold: number
}

const Ctx = createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getSettings()
      .then((s) => { if (!cancelled) { setSettings(s); setError(null); setLoading(false) } })
      .catch((e: unknown) => { if (!cancelled) { setError(errorMessage(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const value = useMemo<SettingsCtx>(() => ({
    settings, loading, error, refresh,
    evThreshold: settings?.ev_threshold_pct ?? 2.0,
  }), [settings, loading, error, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
