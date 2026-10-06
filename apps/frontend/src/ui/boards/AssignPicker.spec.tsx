import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Person, Task } from '@/domain/board'
import { aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { AssignPicker } from '@/ui/boards/AssignPicker'

const me: Person = {
  userId: 'me',
  email: 'alice@example.com',
  name: 'Alice Martin'
}
const bob: Person = {
  userId: 'bob',
  email: 'bob.durand@example.com',
  name: 'Bob Durand'
}
const chloe: Person = {
  userId: 'chloe',
  email: 'chloe@example.com',
  name: 'Chloé Nguyen'
}
const newcomer: Person = { userId: 'new', email: 'new@example.com', name: null }

function open(task: Task, tasks: Task[], boardsApi = fakeBoardsApi()) {
  const anchor = document.createElement('button')
  document.body.append(anchor)
  renderWithProviders(
    <AssignPicker
      task={task}
      boardId="b1"
      members={[newcomer, chloe, bob, me]}
      tasks={tasks}
      anchor={anchor}
      onClose={() => undefined}
    />,
    { boardsApi }
  )
  return boardsApi
}

const options = async () => {
  const picker = within(await screen.findByRole('dialog', { name: /Assign/ }))
  return picker.getAllByRole('menuitemcheckbox')
}

const search = (value: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search people' }), {
    target: { value }
  })
}

describe('AssignPicker', () => {
  it('suggests me, then people often assigned on the board, then everyone else', async () => {
    const task = aTask(null, { key: 'DES-1' })
    open(task, [
      task,
      aTask(null, { assignees: [bob] }),
      aTask(null, { assignees: [bob, chloe] })
    ])

    const rows = await options()

    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveAccessibleName('Alice Martin alice@example.com')
    expect(rows[1]).toHaveAccessibleName('Bob Durand bob.durand@example.com')
    expect(rows[2]).toHaveAccessibleName('Chloé Nguyen chloe@example.com')
    expect(rows[3]).toHaveAccessibleName('new@example.com')
  })

  it('highlights each searched word, ignoring case and accents', async () => {
    const task = aTask(null, { key: 'DES-1' })
    open(task, [task])
    await options()

    search('NGU chlo')

    const [row] = await options()
    expect(
      [...(row?.querySelectorAll('mark') ?? [])].map(mark => mark.textContent)
    ).toEqual(['Chlo', 'Ngu', 'chlo'])
  })

  it('pins the current assignees on top and removes one in a click', async () => {
    const task = aTask(null, { key: 'DES-1', assignees: [chloe] })
    const boardsApi = open(task, [task])

    const first = (await options())[0] ?? document.body

    expect(first).toHaveAccessibleName(/Chloé Nguyen/)
    expect(first).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(first)
    await waitFor(() => {
      expect(boardsApi.setAssignees).toHaveBeenCalledWith('b1', task.id, [])
    })
  })

  it('finds people by first name, last name, email, accents aside, or a loose spelling', async () => {
    const task = aTask(null, { key: 'DES-1' })
    open(task, [task])
    await options()

    search('chloe')
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(1)
    search('dur')
    expect(screen.getByRole('menuitemcheckbox')).toHaveAccessibleName(
      /Bob Durand/
    )
    search('bdrnd')
    expect(screen.getByRole('menuitemcheckbox')).toHaveAccessibleName(
      /Bob Durand/
    )
    search('zed')
    expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument()
    expect(screen.getByText('No one matches “zed”')).toBeInTheDocument()
  })

  it('assigns the top match with Enter and moves into the list with the down arrow', async () => {
    const task = aTask(null, { key: 'DES-1' })
    const boardsApi = open(task, [task])
    await options()

    search('bob')
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search people' }), {
      key: 'Enter'
    })
    await waitFor(() => {
      expect(boardsApi.setAssignees).toHaveBeenCalledWith('b1', task.id, [
        'bob'
      ])
    })

    search('')
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search people' }), {
      key: 'ArrowDown'
    })
    expect(screen.getAllByRole('menuitemcheckbox')[0]).toHaveFocus()
  })

  it('says when saving fails and retries', async () => {
    const task = aTask(null, { key: 'DES-1' })
    const boardsApi = fakeBoardsApi()
    boardsApi.setAssignees.mockRejectedValueOnce(new Error('offline'))
    open(task, [task], boardsApi)

    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: /Bob/ })
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The assignees could not be saved.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(boardsApi.setAssignees).toHaveBeenLastCalledWith('b1', task.id, [
      'bob'
    ])
  })
})
