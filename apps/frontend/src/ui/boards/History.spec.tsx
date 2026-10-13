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
  const entry = { actor: alice, name: null, at }
  boardsApi.history.set(logo.id, [
    {
      ...entry,
      field: 'board',
      from: { id: 'ops', name: 'Ops' },
      to: { id: board.id, name: 'Design' }
    },
    { ...entry, field: 'labels', from: null, to: 'ops-urgent', name: 'Urgent' },
    { ...entry, field: 'labels', from: null, to: 'gone' },
    {
      ...entry,
      field: 'section',
      from: null,
      to: 'ops-todo',
      name: 'Ops To do'
    },
    { ...entry, field: 'section', from: null, to: 'gone' },
    { ...entry, field: 'section', from: 'gone', to: null },
    { ...entry, field: 'deadline', from: null, to: '2026-10-20' },
    { ...entry, field: 'dueDate', from: null, to: '2026-10-13 15:00' },
    { ...entry, field: 'dueDate', from: null, to: '2026-10-12' },
    { ...entry, field: 'assignees', from: null, to: bob.userId },
    { ...entry, field: 'section', from: null, to: doing?.id },
    { ...entry, field: 'title', from: 'Draft', to: 'Logo' },
    { ...entry, field: 'created', from: null, to: 'Draft' }
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
      'Alice moved it from the board Ops to Design',
      'Alice added the label Urgent',
      'Alice added the label a deleted label',
      'Alice moved it to Ops To do',
      'Alice moved it to a deleted section',
      'Alice moved it to No section',
      'Alice set the deadline to Oct 20, 2026',
      'Alice set the due date to Oct 13, 2026, 15:00',
      'Alice set the due date to Oct 12, 2026',
      'Alice assigned bob@example.com',
      'Alice moved it to In progress',
      'Alice renamed it from Draft to Logo',
      'Alice created it'
    ])
  })
})
