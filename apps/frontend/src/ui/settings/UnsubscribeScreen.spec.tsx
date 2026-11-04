import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/application/boards'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { UnsubscribeScreen } from '@/ui/settings/UnsubscribeScreen'

const TOKEN = '6f1c2a4e-8b0d-4c3a-9e21-5d7f0a1b2c3d'

function show(search: string, unsubscribe = vi.fn(() => Promise.resolve())) {
  renderWithProviders(
    <UnsubscribeScreen search={search} unsubscribe={unsubscribe} />
  )
  return unsubscribe
}

describe('UnsubscribeScreen', () => {
  it('asks before it unsubscribes, since mail scanners open links', async () => {
    const unsubscribe = show(`?token=${TOKEN}&kind=changes`)

    expect(
      await screen.findByRole('heading', {
        name: 'Stop emails about “Changes on tasks I follow”?'
      })
    ).toBeVisible()
    expect(unsubscribe).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))

    expect(
      await screen.findByRole('heading', {
        name: 'You won’t get emails about “Changes on tasks I follow” any more.'
      })
    ).toBeVisible()
    expect(unsubscribe).toHaveBeenCalledWith(TOKEN, 'changes')
    expect(
      screen.getByRole('link', { name: 'Change your settings' })
    ).toHaveAttribute('href', '/settings#notifications')
  })

  it('stops every email from a digest link', async () => {
    show(`?token=${TOKEN}&kind=all`)

    expect(
      await screen.findByRole('heading', {
        name: 'Stop all notification emails?'
      })
    ).toBeVisible()
  })

  it('says a link that matches nobody does not work', async () => {
    show(
      `?token=${TOKEN}&kind=all`,
      vi.fn(() => Promise.reject(new ApiError(404, 'not_found')))
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }))

    expect(
      await screen.findByRole('heading', { name: 'This link does not work' })
    ).toBeVisible()
  })

  it('says an incomplete link does not work, without asking', async () => {
    show('?kind=changes')

    expect(
      await screen.findByRole('heading', { name: 'This link does not work' })
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).toBeNull()
  })
})
