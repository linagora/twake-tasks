import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
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

  describe('on a board', () => {
    function designBoard() {
      const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
      const [toDo, , done] = board.sections
      board.tasks = [
        aTask(toDo ?? null, { key: 'DES-1', title: 'Logo' }),
        aTask(toDo ?? null, { key: 'DES-2', title: 'Poster' })
      ]
      const ops = aBoard({ name: 'Ops', keyPrefix: 'OPS' })
      const boardsApi = fakeBoardsApi([board, ops])
      renderRoute(`/boards/${board.id}`, { boardsApi })
      return { board, boardsApi, done }
    }

    it('walks the tasks with j and k, and the arrows from a task', async () => {
      designBoard()
      const logo = await screen.findByRole('button', { name: 'Logo' })

      press('j')
      expect(logo).toHaveFocus()
      press('j')
      expect(screen.getByRole('button', { name: 'Poster' })).toHaveFocus()
      press('ArrowUp', document.activeElement ?? document.body)
      expect(logo).toHaveFocus()
    })

    it('acts on the open task with its letters', async () => {
      const { board, boardsApi, done } = designBoard()
      fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })

      press('a')
      expect(
        await screen.findByRole('dialog', { name: 'Assign DES-1' })
      ).toBeVisible()
      press('Escape', document.activeElement ?? document.body)

      press('x')
      await waitFor(() => {
        expect(boardsApi.moveTask).toHaveBeenCalledWith(
          board.id,
          expect.any(String),
          { sectionId: done?.id }
        )
      })

      press('m')
      expect(
        await screen.findByRole('dialog', { name: 'Move to another board' })
      ).toBeVisible()
    })
  })

  it('lists the shortcuts by where they work', async () => {
    await home()

    press('?')

    const help = within(
      await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    )
    expect(
      help.getByRole('region', { name: 'In an open task' })
    ).toHaveTextContent('Add assignees')
    expect(
      help.getByRole('region', { name: 'In a board or a list' })
    ).toHaveTextContent('Next task')
  })
})
