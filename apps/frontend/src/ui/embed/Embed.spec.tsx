import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Board } from '@/domain/board'
import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const SPACE = 'https://space.example.com'
const roadmap = aProject({ name: 'Roadmap', managed: true })

function spaceBoardsApi(boards: Board[]) {
  const boardsApi = fakeBoardsApi(boards)
  boardsApi.spaceProjects.set('s1', roadmap.id)
  return boardsApi
}

beforeEach(() => {
  window.TWAKE_SPACE_ORIGIN = `${SPACE} http://localhost:3000`
})

afterEach(() => {
  delete window.TWAKE_SPACE_ORIGIN
  vi.restoreAllMocks()
})

describe('the embedded view', () => {
  it("lists the space's boards, without the app's navigation", async () => {
    const boardsApi = spaceBoardsApi([
      aBoard({ name: 'Roadmap', project: roadmap }),
      aBoard({ name: 'Old roadmap', project: roadmap, archived: true }),
      aBoard({ name: 'Elsewhere', project: aProject({ managed: true }) }),
      aBoard({ name: 'Mine' })
    ])
    renderRoute('/embed/spaces/s1', { boardsApi })

    const list = await screen.findByRole('list', { name: 'Boards' })
    expect(
      within(list)
        .getAllByRole('link')
        .map(link => link.textContent)
    ).toEqual(['Roadmap'])
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('says so when the space cannot be found', async () => {
    renderRoute('/embed/spaces/unknown', {
      boardsApi: spaceBoardsApi([aBoard({ project: roadmap })])
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The boards could not be loaded.'
    )
  })

  it('opens a board inside the embed and comes back to the space', async () => {
    const board = aBoard({ name: 'Roadmap', project: roadmap })
    const { router } = renderRoute('/embed/spaces/s1', {
      boardsApi: spaceBoardsApi([board])
    })

    fireEvent.click(await screen.findByRole('link', { name: 'Roadmap' }))
    expect(router.state.location.pathname).toBe(
      `/embed/spaces/s1/boards/${board.id}`
    )

    fireEvent.click(await screen.findByRole('link', { name: 'Back to boards' }))
    expect(router.state.location.pathname).toBe('/embed/spaces/s1')
  })

  it('tells each TwakeSpace origin where it is', async () => {
    const post = vi.spyOn(window.parent, 'postMessage')
    const board = aBoard({ name: 'Roadmap', project: roadmap })
    renderRoute(`/embed/spaces/s1/boards/${board.id}?task=DES-1`, {
      boardsApi: spaceBoardsApi([board])
    })

    const message = {
      type: 'twake-tasks:path',
      path: `/embed/spaces/s1/boards/${board.id}?task=DES-1`
    }
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(message, SPACE)
    })
    expect(post).toHaveBeenCalledWith(message, 'http://localhost:3000')
  })

  it('takes the theme from TwakeSpace only', async () => {
    renderRoute('/embed/spaces/s1', {
      boardsApi: spaceBoardsApi([aBoard({ project: roadmap })])
    })
    await screen.findByRole('list', { name: 'Boards' })
    const theme = (origin: string) => {
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin,
            data: { type: 'twake-space:theme', theme: 'dark' }
          })
        )
      })
    }

    theme('https://evil.example.com')
    expect(document.documentElement).not.toHaveAttribute('data-theme', 'dark')

    theme(SPACE)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
