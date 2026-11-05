import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const section = async () =>
  within(await screen.findByRole('region', { name: 'Calendar feed' }))

describe('calendar feed settings', () => {
  it('makes a link with the tasks chosen, and shows it once', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/settings', { boardsApi })
    const settings = await section()

    fireEvent.mouseDown(
      await settings.findByRole('combobox', { name: /^What to include/ })
    )
    fireEvent.click(
      await screen.findByRole('option', {
        name: 'Also unassigned tasks of my projects'
      })
    )
    fireEvent.click(settings.getByRole('button', { name: 'Create link' }))

    const link = await settings.findByRole('textbox', {
      name: 'Calendar link'
    })
    expect(link).toHaveValue('https://tasks.example.com/api/calendar/1.ics')
    expect(boardsApi.openCalendarFeed).toHaveBeenCalledWith('mine')
    expect(
      settings.getByRole('link', { name: 'Open in my calendar app' })
    ).toHaveAttribute('href', 'webcal://tasks.example.com/api/calendar/1.ics')
  })

  it('offers to reset a link made before, which gives a new one', async () => {
    const boardsApi = fakeBoardsApi()
    await boardsApi.openCalendarFeed('assigned')
    renderRoute('/settings', { boardsApi })
    const settings = await section()

    expect(await settings.findByText(/^Active since/)).toBeVisible()
    expect(settings.queryByRole('textbox')).toBeNull()

    fireEvent.click(settings.getByRole('button', { name: 'Reset link' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Reset the calendar link?' })
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Reset link' }))

    expect(
      await settings.findByRole('textbox', { name: 'Calendar link' })
    ).toHaveValue('https://tasks.example.com/api/calendar/2.ics')
  })

  it('turns the feed off', async () => {
    const boardsApi = fakeBoardsApi()
    await boardsApi.openCalendarFeed('assigned')
    renderRoute('/settings', { boardsApi })
    const settings = await section()

    fireEvent.click(await settings.findByRole('button', { name: 'Turn off' }))
    const dialog = within(
      await screen.findByRole('dialog', {
        name: 'Turn off the calendar feed?'
      })
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Turn off' }))

    expect(
      await settings.findByRole('button', { name: 'Create link' })
    ).toBeVisible()
    expect(boardsApi.closeCalendarFeed).toHaveBeenCalled()
  })

  it('opens from My tasks', async () => {
    renderRoute('/mine')

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add to a calendar' })
    )

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Calendar feed' })
    )
    expect(
      await dialog.findByRole('button', { name: 'Create link' })
    ).toBeVisible()
  })
})
