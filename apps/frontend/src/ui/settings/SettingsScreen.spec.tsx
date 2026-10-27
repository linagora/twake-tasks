import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const sectionNames = () =>
  within(screen.getByRole('list', { name: 'Sidebar sections' }))
    .getAllByRole('button', { expanded: false })
    .map(row => row.querySelector('.MuiListItemText-primary')?.textContent)

describe('SettingsScreen', () => {
  it('unfolds a section on the boards and views it holds', async () => {
    const board = { ...aBoard(), id: 'board-1', name: 'Design' }
    const boardsApi = fakeBoardsApi([board])
    const work = await boardsApi.createSidebarSection('Work')
    const layout = await boardsApi.listSidebarSections()
    await boardsApi.saveSidebarLayout(
      layout.map(section => ({
        id: section.id,
        items:
          section.id === work.id
            ? [{ kind: 'board' as const, id: 'board-1' }]
            : []
      }))
    )
    renderRoute('/settings', { boardsApi })

    const list = within(
      await screen.findByRole('list', { name: 'Sidebar sections' })
    )
    const toggle = await list.findByRole('button', { name: /^Work/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(list.queryByRole('link', { name: 'Design' })).toBeNull()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(await list.findByRole('link', { name: 'Design' })).toHaveAttribute(
      'href',
      '/boards/board-1'
    )
    fireEvent.click(list.getByRole('button', { name: /^Favorites/ }))
    expect(await list.findByText('No boards or views yet')).toBeInTheDocument()
  })

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

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
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
