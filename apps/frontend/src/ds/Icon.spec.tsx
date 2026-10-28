import { Flag } from '@linagora/twake-icons'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Icon } from '@/ds/Icon'
import { SearchBar } from '@/ds/SearchBar'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('Icon', () => {
  it('hides a decorative icon from assistive technologies', () => {
    const { container } = render(<Icon icon={Flag} />)

    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('shows an icon its caller names', () => {
    render(<Icon icon={Flag} aria-hidden={false} aria-label="Priority" />)

    expect(screen.getByLabelText('Priority')).toHaveAttribute(
      'aria-hidden',
      'false'
    )
  })
})

describe('SearchBar', () => {
  it('hides its magnifier from assistive technologies', async () => {
    renderWithProviders(<SearchBar placeholder="Search" />)

    await screen.findByRole('textbox', { name: 'Search' })
    expect(document.querySelector('.SearchBar-icon svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })
})
