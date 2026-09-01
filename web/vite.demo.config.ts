import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

// Demo build for hosting as a single static page (mock data, hash routing, no SW).
// Assets are inlined into one HTML fragment by scripts/make-demo-fragment.py.
export default mergeConfig(base as ReturnType<typeof defineConfig>, defineConfig({
  build: { outDir: 'demo-dist', emptyOutDir: true },
}))
