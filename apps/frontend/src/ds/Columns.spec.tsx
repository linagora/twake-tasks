import { screen } from '@testing-library/react'
import { Avatar } from '@linagora/twake-mui'
import { describe, expect, it } from 'vitest'

import { AvatarStack, Card, CardTitle, Column } from '@/ds/Columns'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('Column', () => {
  it('breaks a column name or card title that has no spaces', async () => {
    const name = 'y'.repeat(300)
    const title = 'x'.repeat(300)
    renderWithProviders(
      <Column title={name} count={1}>
        <Card label={title}>
          <CardTitle>{title}</CardTitle>
        </Card>
      </Column>
    )

    const heading = await screen.findByRole('heading', { name })
    const card = screen.getByRole('article', { name: title })
    expect(getComputedStyle(heading).overflowWrap).toBe('anywhere')
    expect(getComputedStyle(card).overflowWrap).toBe('anywhere')
  })

  it('lets the browser skip the rendering of a card off screen', async () => {
    renderWithProviders(
      <Card label="Ship it">
        <CardTitle>Ship it</CardTitle>
      </Card>
    )

    const style = getComputedStyle(
      await screen.findByRole('article', { name: 'Ship it' })
    )
    expect(style.getPropertyValue('content-visibility')).toBe('auto')
    expect(style.getPropertyValue('contain-intrinsic-size')).toBe('auto 96px')
  })
})

describe('AvatarStack', () => {
  it.each([
    [24, '10.8px'],
    [32, '14.4px']
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
