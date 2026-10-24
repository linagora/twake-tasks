import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { countFitting, FittingChips } from '@/ds/FittingChips'
import { renderWithProviders } from '@/testing/renderWithProviders'

const chips = ['Design', 'Content', 'Frontend', 'Urgent'].map(name => ({
  key: name,
  name,
  chip: <span data-testid={`chip-${name}`}>{name}</span>
}))

const moreLabel = (count: number, names: string) =>
  `${String(count)} more: ${names}`

describe('countFitting', () => {
  it.each([
    [200, [40, 40, 40, 30], 3],
    [120, [40, 40, 40, 30], 2],
    [100, [40, 40, 40, 30], 1],
    [20, [40, 40, 40, 30], 1],
    [0, [40, 40, 40, 30], 3],
    [100, [30], 0]
  ])('fits in %ipx the chips of widths %j', (width, widths, count) => {
    expect(countFitting(width, widths)).toBe(count)
  })
})

describe('FittingChips', () => {
  it('shows every chip before the row is laid out', async () => {
    renderWithProviders(<FittingChips chips={chips} moreLabel={moreLabel} />)

    expect(await screen.findByTestId('chip-Urgent')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).toBe(null)
  })

  it('names the chips that do not fit in a “+n” chip', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 40
    } as DOMRect)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)

    renderWithProviders(<FittingChips chips={chips} moreLabel={moreLabel} />)

    const more = await screen.findByRole('img', {
      name: '3 more: Content, Frontend, Urgent'
    })
    expect(more).toHaveTextContent('+3')
    expect(screen.queryByTestId('chip-Design')).toBeInTheDocument()
    expect(screen.queryByTestId('chip-Content')).toBe(null)
  })
})
