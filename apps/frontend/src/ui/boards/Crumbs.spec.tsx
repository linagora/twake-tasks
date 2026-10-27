import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Crumbs } from '@/ui/boards/Crumbs'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('Crumbs', () => {
  it('keeps a task key on one line, to be cut rather than wrapped', async () => {
    renderWithProviders(<Crumbs label="Task" current="AUD-1" />)

    expect(await screen.findByText('AUD-1')).toHaveStyle({
      whiteSpace: 'nowrap'
    })
  })

  it('lets a field that renames the page wrap, for its label to stay whole', async () => {
    renderWithProviders(
      <Crumbs label="Board" current={<input aria-label="Name" />} />
    )

    const field = await screen.findByRole('textbox', { name: 'Name' })
    expect(field.parentElement).not.toHaveStyle({ whiteSpace: 'nowrap' })
  })
})
