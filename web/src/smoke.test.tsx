// @vitest-environment jsdom
/**
 * Mounts every route in mock mode and fails on any console error/warning.
 * This is the "no console errors in mock mode" check, run headlessly.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const ROUTES = ['/', '/opportunities', '/bets', '/bankroll', '/clv', '/forecasts', '/research', '/method', '/settings']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let App: any
const problems: string[] = []

beforeAll(async () => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubEnv('VITE_MOCK', '1')
  const originalError = console.error
  const originalWarn = console.warn
  console.error = (...args: unknown[]) => { problems.push(`error: ${String(args[0])}`); originalError(...args) }
  console.warn = (...args: unknown[]) => { problems.push(`warn: ${String(args[0])}`); originalWarn(...args) }
  App = (await import('./App')).App
})

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(async () => {
  if (root) await act(async () => { root!.unmount() })
  host?.remove()
  root = null
  host = null
})

describe('smoke', () => {
  for (const path of ROUTES) {
    it(`renders ${path} without console errors`, async () => {
      window.history.pushState({}, '', path)
      host = document.createElement('div')
      document.body.appendChild(host)
      root = createRoot(host)
      await act(async () => { root!.render(<App />) })
      // let the mock's setTimeout-based promises settle
      await act(async () => { await new Promise((r) => setTimeout(r, 600)) })
      expect(host.textContent ?? '').not.toBe('')
      expect(host.querySelector('.state-error')).toBeNull()
      expect(problems).toEqual([])
    })
  }

  it('opens the bet slip from a board row and logs a bet', async () => {
    window.history.pushState({}, '', '/')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => { root!.render(<App />) })
    await act(async () => { await new Promise((r) => setTimeout(r, 600)) })

    // a +EV row: its Kelly stake is non-zero, so the slip submits without edits
    const logButtons = [...host.querySelectorAll('tr.row-pos .col-act button')]
    expect(logButtons.length).toBeGreaterThan(0)
    await act(async () => { (logButtons[0] as HTMLButtonElement).click() })
    expect(host.querySelector('.drawer')).not.toBeNull()

    const submit = [...host.querySelectorAll('.drawer-actions button')].find((b) => b.textContent === 'Log bet')
    expect(submit).toBeTruthy()
    await act(async () => { (submit as HTMLButtonElement).click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 400)) })
    expect(host.querySelector('.drawer')).toBeNull()
    expect(document.body.textContent).toContain('Logged')
    expect(problems).toEqual([])
  })
})
