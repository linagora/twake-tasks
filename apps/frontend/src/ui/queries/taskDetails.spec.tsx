import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useComments } from '@/ui/queries/comments'
import { useLinks } from '@/ui/queries/links'
import { useReminders } from '@/ui/queries/reminders'
import { useDescription, useFollowing, useHistory } from '@/ui/queries/tasks'

function History({ boardId, taskId }: { boardId: string; taskId: string }) {
  const history = useHistory(boardId, taskId)
  return history.isSuccess && !history.isFetching ? <p>history</p> : null
}

function Panel({ boardId, taskId }: { boardId: string; taskId: string }) {
  const [historyShown, setHistoryShown] = useState(false)
  const parts = [
    useDescription(boardId, taskId),
    useComments(boardId, taskId),
    useLinks(boardId, taskId),
    useReminders(boardId, taskId),
    useFollowing(boardId, taskId)
  ]
  const comments = parts[1]
  return (
    <>
      <button
        onClick={() => {
          setHistoryShown(true)
        }}
      >
        history tab
      </button>
      <button
        onClick={() => {
          void comments?.refetch()
        }}
      >
        read comments
      </button>
      {parts.every(part => part.isSuccess && !part.isFetching) && <p>loaded</p>}
      {historyShown && <History boardId={boardId} taskId={taskId} />}
    </>
  )
}

function aPanel() {
  const board = aBoard()
  const task = aTask(board.sections[0] ?? null)
  board.tasks.push(task)
  const api = fakeBoardsApi([board])
  renderWithProviders(<Panel boardId={board.id} taskId={task.id} />, {
    boardsApi: api
  })
  return api
}

describe('the task panel parts', () => {
  it('open with one read of the task details', async () => {
    const api = aPanel()

    await screen.findByText('loaded')

    expect(api.getTaskDetails).toHaveBeenCalledTimes(1)
    expect(api.getDescription).not.toHaveBeenCalled()
    expect(api.listComments).not.toHaveBeenCalled()
    expect(api.listLinks).not.toHaveBeenCalled()
    expect(api.listReminders).not.toHaveBeenCalled()
    expect(api.following).not.toHaveBeenCalled()
  })

  it('show a part opened later from the same read', async () => {
    const api = aPanel()
    await screen.findByText('loaded')

    fireEvent.click(screen.getByRole('button', { name: 'history tab' }))
    await screen.findByText('history')

    expect(api.getTaskDetails).toHaveBeenCalledTimes(1)
    expect(api.listHistory).not.toHaveBeenCalled()
  })

  it('read a part again on its own route', async () => {
    const api = aPanel()
    await screen.findByText('loaded')

    fireEvent.click(screen.getByRole('button', { name: 'read comments' }))

    await waitFor(() => {
      expect(api.listComments).toHaveBeenCalledTimes(1)
    })
    expect(api.getTaskDetails).toHaveBeenCalledTimes(1)
  })
})
