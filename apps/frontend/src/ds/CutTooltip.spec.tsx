import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CutTooltip } from '@/ds/CutTooltip'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('CutTooltip', () => {
  it('waits half a second before showing the whole text', async () => {
    renderWithProviders(
      <CutTooltip title="Rename">
        <button>Website relaunch</button>
      </CutTooltip>
    )

    fireEvent.mouseOver(await screen.findByRole('button'))

    await new Promise(resolve => setTimeout(resolve, 300))
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Rename')
  })
})
