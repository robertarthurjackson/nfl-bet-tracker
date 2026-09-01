import type { ReactNode } from 'react'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <div className="state-error-msg">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>Retry</button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state state-empty">{children}</div>
}

/** Standard loading / error / empty wrapper for a page section. */
export function AsyncSection<T>({
  state, children, empty,
}: {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void }
  children: (data: T) => ReactNode
  empty?: ReactNode
}) {
  if (state.error) return <ErrorBanner message={state.error} onRetry={state.reload} />
  if (state.loading && state.data === null) return <Loading />
  if (state.data === null) return <Empty>{empty ?? 'Nothing here yet.'}</Empty>
  return <>{children(state.data)}</>
}
