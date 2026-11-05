import { vi } from 'vitest'

/** Answers the width media queries as a 390px wide screen would. */
export function phoneScreen(): void {
  const width = 390
  vi.stubGlobal('matchMedia', (media: string) => {
    const bounds = [...media.matchAll(/\((min|max)-width:\s*(-?[\d.]+)px\)/g)]
    return {
      media,
      matches:
        bounds.length > 0 &&
        bounds.every(([, side, value]) =>
          side === 'min' ? width >= Number(value) : width <= Number(value)
        ),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined
    }
  })
}
