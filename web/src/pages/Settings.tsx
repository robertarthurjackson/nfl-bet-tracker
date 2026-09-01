import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Book, Jurisdiction, Settings, SnapshotStatus, SnapshotTier } from '../api/types'
import { AsyncSection, ErrorBanner, Loading } from '../components/States'
import { useToast } from '../components/Toast'
import { errorMessage, useAsync } from '../lib/useAsync'
import { useSettings } from '../lib/settings-context'
import { dateTime, num } from '../lib/format'

const DEVIG = ['power', 'multiplicative', 'additive', 'shin', 'worst_case']
const TIERS: SnapshotTier[] = ['sharp', 'soft', 'full']
const JURISDICTIONS: Jurisdiction[] = ['AB', 'BC', 'reference']
const JUR_LABEL: Record<Jurisdiction, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  reference: 'Reference (price source only)',
}

export function SettingsPage() {
  const toast = useToast()
  const { settings, loading, error, refresh } = useSettings()
  const [draft, setDraft] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (settings) setDraft(structuredClone(settings)) }, [settings])

  const patch = (p: Partial<Settings>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const patchKelly = (p: Partial<Settings['kelly']>) =>
    setDraft((d) => (d ? { ...d, kelly: { ...d.kelly, ...p } } : d))

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await api.putSettings(draft)
      toast.success('Settings saved')
      refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <section className="card">
        <h2 className="card-title">Model &amp; bankroll</h2>
        {error && <ErrorBanner message={error} onRetry={refresh} />}
        {loading && !draft && <Loading label="Loading settings…" />}
        {draft && (
          <>
            <div className="form-grid">
              <NumField label="Season" value={draft.season} step={1} onChange={(v) => patch({ season: v })} />
              <NumField label="Starting bankroll" value={draft.bankroll_starting} step={50} onChange={(v) => patch({ bankroll_starting: v })} />
              <NumField label="EV threshold (%)" value={draft.ev_threshold_pct} step={0.5} onChange={(v) => patch({ ev_threshold_pct: v })} />
              <label className="field">
                <span>De-vig method</span>
                <select className="select" value={draft.devig_method} onChange={(e) => patch({ devig_method: e.target.value })}>
                  {[...new Set([draft.devig_method, ...DEVIG])].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Sharp / reference book</span>
                <input type="text" value={draft.sharp_book} onChange={(e) => patch({ sharp_book: e.target.value })} />
              </label>
              <NumField
                label="Odds API credits per week"
                value={draft.credit_budget_per_week}
                step={5}
                onChange={(v) => patch({ credit_budget_per_week: v })}
                help="Spending cap for the odds feed, not betting money. The Odds API free plan allows 500 credits/month, so ~115/week keeps a full season inside it. Closing-line snapshots ignore this cap."
              />
            </div>

            <h3 className="sub-title">Kelly staking</h3>
            <div className="form-grid">
              <label className="field">
                <span>Mode</span>
                <select className="select" value={draft.kelly.mode} onChange={(e) => patchKelly({ mode: e.target.value })}>
                  {[...new Set([draft.kelly.mode, 'schedule', 'fixed'])].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <NumField label="Fixed fraction" value={draft.kelly.fixed_fraction} step={0.05} onChange={(v) => patchKelly({ fixed_fraction: v })} />
              <NumField label="Max bet (% bankroll)" value={draft.kelly.max_bet_pct} step={0.25} onChange={(v) => patchKelly({ max_bet_pct: v })} />
              <NumField label="Max open exposure (%)" value={draft.kelly.max_open_exposure_pct} step={0.5} onChange={(v) => patchKelly({ max_open_exposure_pct: v })} />
              <label className="field field-wide toggle-field">
                <input
                  type="checkbox"
                  checked={draft.kelly.price_sensitivity_adjust}
                  onChange={(e) => patchKelly({ price_sensitivity_adjust: e.target.checked })}
                />
                <span>Price-sensitivity adjustment (trim stakes at long prices)</span>
              </label>
            </div>

            <h3 className="sub-title">Kelly schedule</h3>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th className="num">From week</th><th className="num">To week</th><th className="num">Fraction</th><th /></tr>
                </thead>
                <tbody>
                  {draft.kelly.schedule.map((row, i) => (
                    <tr key={i}>
                      <td className="num">
                        <input className="cell-input" type="number" value={row.from_week} onChange={(e) => {
                          const next = [...draft.kelly.schedule]
                          next[i] = { ...row, from_week: Number(e.target.value) }
                          patchKelly({ schedule: next })
                        }} />
                      </td>
                      <td className="num">
                        <input className="cell-input" type="number" value={row.to_week} onChange={(e) => {
                          const next = [...draft.kelly.schedule]
                          next[i] = { ...row, to_week: Number(e.target.value) }
                          patchKelly({ schedule: next })
                        }} />
                      </td>
                      <td className="num">
                        <input className="cell-input" type="number" step="0.001" value={row.fraction} onChange={(e) => {
                          const next = [...draft.kelly.schedule]
                          next[i] = { ...row, fraction: Number(e.target.value) }
                          patchKelly({ schedule: next })
                        }} />
                      </td>
                      <td className="col-act">
                        <button type="button" className="btn btn-xs btn-danger" onClick={() => {
                          patchKelly({ schedule: draft.kelly.schedule.filter((_, j) => j !== i) })
                        }}>del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-sm" onClick={() => {
                const last = draft.kelly.schedule[draft.kelly.schedule.length - 1]
                patchKelly({
                  schedule: [...draft.kelly.schedule, {
                    from_week: last ? Math.min(22, last.to_week + 1) : 1,
                    to_week: 22,
                    fraction: last ? last.fraction : 0.25,
                  }],
                })
              }}>Add row</button>
              <button type="button" className="btn" onClick={() => settings && setDraft(structuredClone(settings))}>Revert</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>

            <div className={`keynote ${draft.api_key_set ? 'ok' : 'warn'}`}>
              {draft.api_key_set
                ? 'Odds API key is set on the server.'
                : 'No odds API key on the server — snapshots will fail.'}
              {' '}Put it in <code>api/.env</code> as <code>ODDS_API_KEY</code>, then restart the API.
            </div>
          </>
        )}
      </section>

      <BooksPanel />
      <SnapshotsPanel />
    </div>
  )
}

function NumField({ label, value, step, onChange, help }: { label: string; value: number; step: number; onChange: (v: number) => void; help?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
      {help && <span className="field-help">{help}</span>}
    </label>
  )
}

function BooksPanel() {
  const toast = useToast()
  const state = useAsync<Book[]>(() => api.getBooks(), [])
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(b: Book) {
    setBusy(b.key)
    try {
      await api.putBook(b.key, !b.enabled)
      toast.success(`${b.name} ${b.enabled ? 'disabled' : 'enabled'}`)
      state.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Books</h2>
      <AsyncSection state={state}>
        {(books) => (
          <>
            {JURISDICTIONS.map((j) => {
              const rows = books.filter((b) => b.jurisdiction === j)
              if (rows.length === 0) return null
              return (
                <div key={j} className="book-group">
                  <h3 className="sub-title">{JUR_LABEL[j]}</h3>
                  <ul className="book-list">
                    {rows.map((b) => (
                      <li key={b.key} className="book-row">
                        <div>
                          <span className="book-name">{b.name}</span>
                          {b.is_sharp && <span className="badge badge-sharp">sharp</span>}
                          <span className="muted small"> {b.key} · {b.region}</span>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={b.enabled}
                            disabled={busy === b.key}
                            onChange={() => toggle(b)}
                          />
                          <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
                          <span className="switch-label">{b.enabled ? 'on' : 'off'}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </>
        )}
      </AsyncSection>
    </section>
  )
}

function SnapshotsPanel() {
  const toast = useToast()
  const state = useAsync<SnapshotStatus>(() => api.getSnapshotStatus(), [])
  const [running, setRunning] = useState<SnapshotTier | null>(null)

  async function run(tier: SnapshotTier) {
    setRunning(tier)
    try {
      const res = await api.runSnapshot(tier)
      toast.success(`${tier}: ${res.rows.toLocaleString()} rows, ${res.credits_used} credits used, ${res.credits_remaining.toLocaleString()} left`)
      state.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setRunning(null)
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Snapshots</h2>
      <div className="row-actions">
        {TIERS.map((t) => (
          <button key={t} type="button" className="btn btn-primary" disabled={running !== null} onClick={() => run(t)}>
            {running === t ? `Running ${t}…` : `Run ${t}`}
          </button>
        ))}
      </div>
      <AsyncSection state={state}>
        {(s) => (
          <>
            <div className="tiles">
              <div className="tile"><div className="tile-k">API credits left</div><div className="tile-v">{s.credits.remaining.toLocaleString()}</div></div>
              <div className="tile"><div className="tile-k">Used this month</div><div className="tile-v">{s.credits.used_month.toLocaleString()}</div></div>
              <div className="tile"><div className="tile-k">API credits this week</div><div className="tile-v">{s.credits.used_week} / {s.credits.budget_week}</div></div>
              <div className="tile">
                <div className="tile-k">Scheduler</div>
                <div className={`tile-v ${s.scheduler_running ? 'pos' : 'neg'}`}>{s.scheduler_running ? 'running' : 'stopped'}</div>
              </div>
            </div>

            <h3 className="sub-title">Last runs</h3>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Tier</th><th>When</th><th className="num">Credits</th><th className="num">Rows</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {s.last_runs.length === 0 && <tr><td colSpan={5} className="muted">No runs recorded.</td></tr>}
                  {s.last_runs.map((r, i) => (
                    <tr key={`${r.tier}-${r.at}-${i}`}>
                      <td>{r.tier}</td>
                      <td className="nowrap">{dateTime(r.at)}</td>
                      <td className="num">{num(r.credits_used, 0)}</td>
                      <td className="num">{r.rows.toLocaleString()}</td>
                      <td>
                        {r.ok
                          ? <span className="badge badge-win">ok</span>
                          : <span className="badge badge-loss" title={r.error ?? ''}>{r.error ?? 'failed'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="sub-title">Schedule</h3>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Tier</th><th>Cron</th><th>Description</th></tr></thead>
                <tbody>
                  {s.schedule.map((r) => (
                    <tr key={`${r.tier}-${r.cron}`}>
                      <td>{r.tier}</td>
                      <td><code>{r.cron}</code></td>
                      <td>{r.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncSection>
    </section>
  )
}
