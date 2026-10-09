import { screen } from '@testing-library/react'
import { Avatar } from '@linagora/twake-mui'
import { describe, expect, it } from 'vitest'

import { AvatarStack } from '@/ds/Columns'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('AvatarStack', () => {
  it.each([
    [24, '9px'],
    [32, '12.6px']
  ])('scales the initials of %ipx avatars to %s', async (size, fontSize) => {
    renderWithProviders(
      <AvatarStack size={size}>
        <Avatar size={size} role="img" aria-label="Maya M">
          MM
        </Avatar>
      </AvatarStack>
    )

    const avatar = await screen.findByRole('img', { name: 'Maya M' })
    expect(getComputedStyle(avatar).fontSize).toBe(fontSize)
  })
})
