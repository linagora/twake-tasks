import { useMutation } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { type BoardSummary } from '@/domain/board'
import { fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useAgenda } from '@/ui/queries/agenda'
import { useBoards } from '@/ui/queries/boards'
import { useFilters } from '@/ui/queries/filters'
import { useUnreadNotifications } from '@/ui/queries/notifications'

function Lists() {
  const boards = useBoards()
  const agenda = useAgenda('upcoming')
  const filters = useFilters()
  const unread = useUnreadNotifications()
  const loaded = [boards, agenda, filters, unread].every(
    query => query.isSuccess && !query.isFetching
  )
  return loaded ? <p>loaded</p> : null
}

function Screen() {
  const [shown, setShown] = useState(true)
  const write = useMutation({ mutationFn: () => Promise.resolve() })
  const boards = useBoards()
  return (
    <>
      <button
        onClick={() => {
          setShown(!shown)
        }}
      >
        toggle
      </button>
      <button
        onClick={() => {
          write.mutate()
        }}
      >
        write
      </button>
      <button
        onClick={() => {
          void boards.refetch()
        }}
      >
        read boards
      </button>
      {write.isSuccess && <p>written</p>}
      {shown && <Lists />}
    </>
  )
}

async function remount() {
  fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
  fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
  await screen.findByText('loaded')
}

describe('the lists', () => {
  it('are not read again when they show again with no write in between', async () => {
    const api = fakeBoardsApi()
    renderWithProviders(<Screen />, { boardsApi: api })
    await screen.findByText('loaded')

    await remount()

    expect(api.listBoards).toHaveBeenCalledTimes(1)
    expect(api.agenda).toHaveBeenCalledTimes(1)
    expect(api.listFilters).toHaveBeenCalledTimes(1)
    expect(api.listNotifications).toHaveBeenCalledTimes(1)
  })

  it('read the boards and the agenda again where they show next after a write', async () => {
    const api = fakeBoardsApi()
    renderWithProviders(<Screen />, { boardsApi: api })
    await screen.findByText('loaded')

    fireEvent.click(screen.getByRole('button', { name: 'write' }))
    await screen.findByText('written')
    await remount()

    await waitFor(() => {
      expect(api.listBoards).toHaveBeenCalledTimes(2)
    })
    expect(api.agenda).toHaveBeenCalledTimes(2)
  })

  it('read the boards again after a write that lands while they are read', async () => {
    const api = fakeBoardsApi()
    renderWithProviders(<Screen />, { boardsApi: api })
    await screen.findByText('loaded')
    let answerBeforeWrite: (boards: BoardSummary[]) => void = () => undefined
    api.listBoards.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answerBeforeWrite = resolve
        })
    )

    fireEvent.click(screen.getByRole('button', { name: 'read boards' }))
    await waitFor(() => {
      expect(api.listBoards).toHaveBeenCalledTimes(2)
    })
    fireEvent.click(screen.getByRole('button', { name: 'write' }))
    await screen.findByText('written')
    answerBeforeWrite([])

    await waitFor(() => {
      expect(api.listBoards).toHaveBeenCalledTimes(3)
    })
  })
})
