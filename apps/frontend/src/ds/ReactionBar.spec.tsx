import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ReactionBar } from '@/ds/ReactionBar'
import { renderWithProviders } from '@/testing/renderWithProviders'

const labels = {
  group: 'Reactions',
  who: 'Who reacted',
  hidden: (count: number) => `+${String(count)}`
}

describe('ReactionBar', () => {
  it('keeps the chip named while its people show', async () => {
    renderWithProviders(
      <ReactionBar
        reactions={[
          {
            emoji: '👍',
            count: 1,
            mine: false,
            who: [{ key: 'alice', name: 'Alice Martin', avatar: null }],
            label: '👍 from Alice Martin'
          }
        ]}
        labels={labels}
        readOnly={false}
        onReact={() => undefined}
      />
    )
    const chip = await screen.findByRole('button', {
      name: '👍 from Alice Martin'
    })

    fireEvent.mouseOver(chip)
    await screen.findByRole('tooltip')

    expect(chip).toHaveAccessibleName('👍 from Alice Martin')
    expect(chip).toHaveAccessibleDescription('Alice Martin')
  })
})
