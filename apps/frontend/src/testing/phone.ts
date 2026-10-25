import { onTestFinished, vi } from 'vitest'

/** Matches the media queries of a phone's width for the rest of the test. */
export function onAPhone(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  }))
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
}
