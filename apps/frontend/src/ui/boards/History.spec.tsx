import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const alice = { userId: 'alice', email: 'alice@example.com', name: 'Alice' }
const bob = { userId: 'bob', email: 'bob@example.com', name: null }

function logoBoard() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', members: [bob] })
  const [, doing] = board.sections
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  const at = '2026-10-05T09:00:00Z'
  boardsApi.history.set(logo.id, [
    { actor: alice, field: 'assignees', from: null, to: bob.userId, at },
    { actor: alice, field: 'section', from: null, to: doing?.id, at },
    { actor: alice, field: 'title', from: 'Draft', to: 'Logo', at },
    { actor: alice, field: 'created', from: null, to: 'Draft', at }
  ])
  return { board, boardsApi }
}

describe('History', () => {
  it('tells who changed what on a task', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'History' }))
    const history = within(await screen.findByRole('list', { name: 'History' }))

    expect(
      (await history.findAllByRole('listitem')).map(
        item => within(item).getByRole('paragraph').textContent.split(' · ')[0]
      )
    ).toEqual([
      'Alice assigned bob@example.com',
      'Alice moved it to In progress',
      'Alice renamed it from Draft to Logo',
      'Alice created it'
    ])
  })
})
