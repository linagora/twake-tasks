import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const sectionNames = () =>
  within(screen.getByRole('list', { name: 'Sidebar sections' }))
    .getAllByRole('listitem')
    .map(row => row.querySelector('.MuiListItemText-primary')?.textContent)
    .filter(name => name !== undefined)

describe('SettingsScreen', () => {
  it('adds, renames, moves and deletes the sections of the sidebar, Favorites kept', async () => {
    const boardsApi = fakeBoardsApi()
    await boardsApi.createSidebarSection('Work')
    renderRoute('/settings', { boardsApi })

    await screen.findByRole('list', { name: 'Sidebar sections' })
    await waitFor(() => {
      expect(sectionNames()).toEqual(['Favorites', 'Work'])
    })
    expect(screen.queryByRole('button', { name: 'Delete Favorites' })).toBe(
      null
    )
    expect(
      screen.getByRole('button', { name: 'Move Favorites up' })
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'New section' }))
    const created = within(
      await screen.findByRole('dialog', { name: 'New section' })
    )
    fireEvent.change(created.getByLabelText(/^Name/), {
      target: { value: 'Home' }
    })
    fireEvent.click(created.getByRole('button', { name: 'Create' }))
    await waitFor(() => {
      expect(sectionNames()).toEqual(['Favorites', 'Work', 'Home'])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rename Favorites' }))
    const renamed = within(
      await screen.findByRole('dialog', { name: 'Rename the section' })
    )
    fireEvent.change(renamed.getByLabelText(/^Name/), {
      target: { value: 'Starred' }
    })
    fireEvent.click(renamed.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(sectionNames()).toEqual(['Starred', 'Work', 'Home'])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move Starred down' }))
    await waitFor(() => {
      expect(sectionNames()).toEqual(['Work', 'Starred', 'Home'])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }))
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Delete Work?' })
      ).getByRole('button', { name: 'Delete' })
    )
    await waitFor(() => {
      expect(sectionNames()).toEqual(['Starred', 'Home'])
    })
  })
})
