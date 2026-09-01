import { useEffect, useState, type ReactElement } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { USE_MOCK } from '../api'

interface NavItem { to: string; label: string; icon: ReactElement; primary?: boolean }

const I = (d: string, extra?: ReactElement) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
    {extra}
  </svg>
)

const NAV: NavItem[] = [
  { to: '/', label: 'Board', primary: true, icon: I('M3 6h18M3 12h18M3 18h12') },
  { to: '/opportunities', label: 'Alerts', primary: true, icon: I('M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6zM10.5 20a1.8 1.8 0 0 0 3 0') },
  { to: '/bets', label: 'Bets', primary: true, icon: I('M4 5h16v14H4zM8 9h8M8 13h8M8 17h5') },
  { to: '/bankroll', label: 'Bankroll', primary: true, icon: I('M3 17l5-6 4 3 5-7 4 4') },
  { to: '/clv', label: 'CLV', icon: I('M12 4v16M6 10l6-6 6 6') },
  { to: '/forecasts', label: 'Shadow', icon: I('M12 5c-5 0-8 7-8 7s3 7 8 7 8-7 8-7-3-7-8-7z', <circle cx="12" cy="12" r="2.6" />) },
  { to: '/research', label: 'Research', icon: I('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 21l-4.5-4.5') },
  { to: '/method', label: 'Method', icon: I('M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5') },
  { to: '/settings', label: 'Settings', icon: I('M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM19.4 13.5l1.7 1.3-1.8 3.1-2-.8a7.6 7.6 0 0 1-1.8 1l-.3 2.1h-3.6l-.3-2.1a7.6 7.6 0 0 1-1.8-1l-2 .8-1.8-3.1 1.7-1.3a7.4 7.4 0 0 1 0-2.1L4.7 10l1.8-3.1 2 .8a7.6 7.6 0 0 1 1.8-1l.3-2.1h3.6l.3 2.1c.64.25 1.24.58 1.8 1l2-.8L19.9 10l-1.7 1.3c.07.7.07 1.41 0 2.1z') },
]

const MORE_ICON = I('M5 12h.01M12 12h.01M19 12h.01')

export function Layout() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const primary = NAV.filter((n) => n.primary)
  const secondary = NAV.filter((n) => !n.primary)
  const onSecondary = secondary.some((n) => n.to === location.pathname)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            Bet Tracker
            {USE_MOCK && <em className="mock-tag">mock</em>}
          </span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="side-link">
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        {USE_MOCK && (
          <div className="mock-banner">
            <span>Demo — synthetic odds and bets, nothing is real money.</span>
            <a className="btn btn-xs" href="https://github.com/robertarthurjackson/nfl-bet-tracker#setup" target="_blank" rel="noreferrer">
              Get your own free live version
            </a>
          </div>
        )}
        <Outlet />
      </main>

      {moreOpen && (
        <>
          <div className="sheet-scrim" onClick={() => setMoreOpen(false)} />
          <div className="sheet" role="dialog" aria-label="More pages">
            {secondary.map((n) => (
              <NavLink key={n.to} to={n.to} className="sheet-link">
                <span className="nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </NavLink>
            ))}
          </div>
        </>
      )}

      <nav className="tabbar" aria-label="Main">
        {primary.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="tab">
            <span className="nav-icon">{n.icon}</span>
            <span className="tab-label">{n.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`tab tab-more${onSecondary || moreOpen ? ' active' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
        >
          <span className="nav-icon">{MORE_ICON}</span>
          <span className="tab-label">More</span>
        </button>
      </nav>
    </div>
  )
}
