/** localStorage helpers that never throw (Safari private mode, quota, etc.). */

const PREFIX = 'nflbet:'

export function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* ignore — persistence is a convenience, not a requirement */
  }
}
