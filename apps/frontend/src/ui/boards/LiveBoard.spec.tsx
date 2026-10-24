import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { typeRichText } from '@/testing/richText'

const settle = () =>
  act(() => new Promise<void>(resolve => setTimeout(resolve, 50)))

async function openLogo() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  board.tasks = [
    aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  ]
  const boardsApi = fakeBoardsApi([board])
  renderRoute(`/boards/${board.id}?task=DES-1`, { boardsApi })
  const panel = within(
    await screen.findByRole('dialog', { name: 'DES-1 Logo' })
  )
  const composer = await panel.findByRole('textbox', { name: 'Comment' })
  await settle()
  const send = async () => {
    await typeRichText(composer, 'Blue.')
    fireEvent.click(panel.getByRole('button', { name: 'Send' }))
    await panel.findByRole('article', { name: 'me@example.com' })
    await settle()
  }
  return {
    board,
    boardsApi,
    boardReads: boardsApi.getBoard.mock.calls.length,
    commentReads: boardsApi.listComments.mock.calls.length,
    send
  }
}

describe('a board open in two places', () => {
  it('shows a change made elsewhere', async () => {
    const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })
    await screen.findByRole('heading', { name: 'Design' })

    act(() => {
      boardsApi.changeElsewhere(board.id, changed => {
        changed.tasks.push(
          aTask(changed.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
        )
      })
    })

    expect(
      await screen.findByRole('button', { name: 'Logo' })
    ).toBeInTheDocument()
  })

  it('shows a comment and a reaction made elsewhere on the open task', async () => {
    const bob = { userId: 'bob', email: 'bob@example.com', name: 'Bob Durand' }
    const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const logo = aTask(board.sections[0] ?? null, {
      key: 'DES-1',
      title: 'Logo'
    })
    board.tasks = [logo]
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}?task=DES-1`, { boardsApi })
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )

    act(() => {
      boardsApi.comments.set(logo.id, [
        {
          id: 'c1',
          author: bob,
          body: 'Which palette?',
          createdAt: '2026-10-05T09:00:00Z',
          reactions: [{ emoji: '🎉', people: [bob] }]
        }
      ])
      boardsApi.changeElsewhere(board.id, changed => {
        const task = changed.tasks[0]
        if (task) task.commentCount = 1
      })
    })

    const comment = within(
      await panel.findByRole('article', { name: 'Bob Durand' })
    )
    expect(comment.getByText('Which palette?')).toBeInTheDocument()
    expect(
      comment.getByRole('button', { name: '🎉 from Bob Durand' })
    ).toBeInTheDocument()
  })

  it('reads the board and the open comments once per change', async () => {
    const { board, boardsApi, boardReads, commentReads } = await openLogo()

    act(() => {
      boardsApi.changeElsewhere(board.id, () => undefined)
    })
    await settle()

    expect(boardsApi.getBoard).toHaveBeenCalledTimes(boardReads + 1)
    expect(boardsApi.listComments).toHaveBeenCalledTimes(commentReads + 1)
  })

  it('does not read the board again for the version it is already reading', async () => {
    const { boardsApi, boardReads, commentReads, send } = await openLogo()
    const read = boardsApi.getBoard.getMockImplementation()
    boardsApi.getBoard.mockImplementationOnce(async boardId => {
      await Promise.resolve()
      act(() => {
        boardsApi.changeElsewhere(boardId, () => undefined)
      })
      return read?.(boardId) ?? Promise.reject(new Error('no board'))
    })

    await send()

    expect(boardsApi.getBoard).toHaveBeenCalledTimes(boardReads + 1)
    expect(boardsApi.listComments).toHaveBeenCalledTimes(commentReads + 1)
  })

  it('reads the board once more when the read under way brings an older version', async () => {
    const { boardsApi, boardReads, send } = await openLogo()
    const read = boardsApi.getBoard.getMockImplementation()
    boardsApi.getBoard.mockImplementationOnce(async boardId => {
      const before = await (read?.(boardId) ??
        Promise.reject(new Error('no board')))
      act(() => {
        boardsApi.changeElsewhere(boardId, () => undefined)
      })
      return before
    })

    await send()

    expect(boardsApi.getBoard).toHaveBeenCalledTimes(boardReads + 2)
  })

  it.each([
    ['the board', '', 'dialog', 'DES-1 Logo'],
    ['its trash', '/trash', 'heading', 'Trash']
  ] as const)(
    'leaves nothing of a board the viewer was removed from on %s',
    async (_, page, role, name) => {
      const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
      board.tasks = [
        aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
      ]
      const boardsApi = fakeBoardsApi([board])
      renderRoute(`/boards/${board.id}${page}?task=DES-1`, { boardsApi })
      await screen.findByRole(role, { name })

      boardsApi.getBoard.mockRejectedValue(new ApiError(404, 'not_found'))
      act(() => {
        boardsApi.changeElsewhere(board.id, () => undefined)
      })

      expect(
        await screen.findByText(
          "This board doesn't exist, or you can't open it."
        )
      ).toBeInTheDocument()
      expect(screen.queryByText('Design')).toBeNull()
      expect(screen.queryByText('Logo')).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    }
  )
})
