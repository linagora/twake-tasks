import { fireEvent, screen } from '@testing-library/react'
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
      await screen.findByRole('dialog', { name: 'Quick add' })
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
    expect(help).toHaveTextContent('Quick add')
  })
})
