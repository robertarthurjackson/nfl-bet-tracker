import { useCallback, useEffect, useRef, useState } from 'react'
import { loadStored, saveStored } from './storage'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string') return e
  return 'Unexpected error'
}

/** Fetch-on-mount helper with loading / error state and a manual reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    setLoading(true)
    setError(null)
    fnRef.current()
      .then((v) => { if (!cancelled) { setData(v); setLoading(false) } })
      .catch((e: unknown) => { if (!cancelled) { setError(errorMessage(e)); setLoading(false) } })
    return () => { cancelled = true; alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload }
}

/** useState mirrored into localStorage (best-effort). */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => loadStored(key, initial))
  const set = useCallback((v: T) => {
    setValue(v)
    saveStored(key, v)
  }, [key])
  return [value, set]
}
