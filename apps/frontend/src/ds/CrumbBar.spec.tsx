import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CrumbTrail } from '@/ds/CrumbBar'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('CrumbTrail', () => {
  it('shrinks below its content in a row, for the actions beside it to stay', async () => {
    renderWithProviders(
      <CrumbTrail aria-label="Task">
        <span>Design</span>
        <span>DES-1</span>
      </CrumbTrail>
    )

    const trail = await screen.findByRole('navigation', { name: 'Task' })
    expect(getComputedStyle(trail).minWidth).toBe('0px')
  })
})
