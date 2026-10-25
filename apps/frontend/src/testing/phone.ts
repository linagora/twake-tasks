import { onTestFinished, vi } from 'vitest'

export function onAPhone(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined
  }))
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
}
