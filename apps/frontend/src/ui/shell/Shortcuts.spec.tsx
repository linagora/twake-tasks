import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const press = (key: string, target: Element = document.body) => {
  fireEvent.keyDown(target, { key })
}

async function home() {
  renderRoute('/', { boardsApi: fakeBoardsApi([aBoard()]) })
  return screen.findByRole('search')
}

describe('keyboard shortcuts', () => {
  it('opens quick add with q', async () => {
    await home()

    press('q')

    expect(
      await screen.findByRole('dialog', { name: 'Create a task' })
    ).toBeVisible()
  })

  it('focuses search with /', async () => {
    await home()

    press('/')

    expect(screen.getByLabelText('Search')).toHaveFocus()
  })

  it('goes to a view with g then its letter', async () => {
    await home()

    press('g')
    press('m')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'My tasks' })
    ).toBeVisible()
  })

  it('leaves keys alone while typing', async () => {
    await home()
    const field = screen.getByLabelText('Search')

    press('q', field)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists the shortcuts with ?', async () => {
    await home()

    press('?')

    const help = await screen.findByRole('dialog', {
      name: 'Keyboard shortcuts'
    })
    expect(help).toHaveTextContent('Create a task')
  })

  it('offers to turn the single-key shortcuts off, on by default', async () => {
    await home()

    press('?')

    const toggle = await screen.findByRole('switch', {
      name: 'Single-key shortcuts'
    })
    expect(toggle).toBeChecked()
    expect(toggle).toHaveAccessibleDescription(
      'Turn off if you use speech recognition or press keys by accident.'
    )
  })

  it('ignores every single-key shortcut once turned off, after a reload too', async () => {
    const { unmount } = renderRoute('/', {
      boardsApi: fakeBoardsApi([aBoard()])
    })
    await screen.findByRole('search')
    press('?')
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Single-key shortcuts' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    unmount()

    await home()
    press('q')
    press('/')
    press('?')
    press('g')
    press('t')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search')).not.toHaveFocus()
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Today' })
    ).not.toBeInTheDocument()
  })

  it('works again once turned back on', async () => {
    localStorage.setItem('twake-tasks:shortcuts', 'off')
    await home()
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', {
        name: 'Alice Martin'
      })
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Keyboard shortcuts' })
    )
    const toggle = await screen.findByRole('switch', {
      name: 'Single-key shortcuts'
    })
    expect(toggle).not.toBeChecked()

    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    press('q')

    expect(
      await screen.findByRole('dialog', { name: 'Create a task' })
    ).toBeVisible()
  })
})
