import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'

const IS_DEMO = import.meta.env.VITE_DEMO === '1'
const Router = IS_DEMO ? HashRouter : BrowserRouter
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { SettingsProvider } from './lib/settings-context'
import { BoardPage } from './pages/Board'
import { OpportunitiesPage } from './pages/Opportunities'
import { BetsPage } from './pages/Bets'
import { BankrollPage } from './pages/Bankroll'
import { ClvPage } from './pages/Clv'
import { ForecastsPage } from './pages/Forecasts'
import { ResearchPage } from './pages/Research'
import { MethodPage } from './pages/Method'
import { SettingsPage } from './pages/Settings'

export function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <Router>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<BoardPage />} />
              <Route path="/opportunities" element={<OpportunitiesPage />} />
              <Route path="/bets" element={<BetsPage />} />
              <Route path="/bankroll" element={<BankrollPage />} />
              <Route path="/clv" element={<ClvPage />} />
              <Route path="/forecasts" element={<ForecastsPage />} />
              <Route path="/research" element={<ResearchPage />} />
              <Route path="/method" element={<MethodPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Router>
      </SettingsProvider>
    </ToastProvider>
  )
}
