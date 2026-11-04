import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const section = async () =>
  within(await screen.findByRole('region', { name: 'Notifications' }))

describe('notification settings', () => {
  it('starts with every notification on, emailed right away', async () => {
    renderRoute('/settings')
    const settings = await section()

    for (const name of [
      'Changes on tasks I follow, in the app',
      'Changes on tasks I follow, by email'
    ]) {
      expect(await settings.findByRole('switch', { name })).toBeChecked()
    }
    expect(settings.getByRole('combobox')).toHaveTextContent('Right away')
  })

  it('turns off the email of a kind and says it is saved', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/settings', { boardsApi })
    const settings = await section()

    fireEvent.click(
      await settings.findByRole('switch', {
        name: 'Comments on tasks I follow, by email'
      })
    )

    expect(await screen.findByText('Saved')).toBeVisible()
    expect(boardsApi.keepNotificationPreferences).toHaveBeenCalledWith({
      mutedInApp: [],
      mutedEmail: ['comments'],
      emailFrequency: 'instant'
    })
  })

  it('turns off the email too when a kind is off in the app', async () => {
    renderRoute('/settings')
    const settings = await section()

    fireEvent.click(
      await settings.findByRole('switch', { name: 'My reminders, in the app' })
    )

    const email = settings.getByRole('switch', {
      name: 'My reminders, by email'
    })
    await waitFor(() => {
      expect(email).not.toBeChecked()
    })
    expect(email).toBeDisabled()
    expect(settings.getByText('Turn on in the app first.')).toBeVisible()
  })

  it('switches to one daily summary', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/settings', { boardsApi })
    const settings = await section()

    fireEvent.mouseDown(await settings.findByRole('combobox'))
    fireEvent.click(
      await screen.findByRole('option', { name: 'One daily summary at 8:00' })
    )

    await waitFor(() => {
      expect(boardsApi.keepNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ emailFrequency: 'daily' })
      )
    })
  })

  it('puts the switch back when saving fails', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.keepNotificationPreferences.mockRejectedValueOnce(
      new Error('offline')
    )
    renderRoute('/settings', { boardsApi })
    const settings = await section()
    const email = await settings.findByRole('switch', {
      name: 'Changes on tasks I follow, by email'
    })

    fireEvent.click(email)

    expect(
      await screen.findByText('Your settings could not be saved.')
    ).toBeVisible()
    expect(email).toBeChecked()
  })
})
