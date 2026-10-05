import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const SPACE = 'https://space.example.com'

beforeEach(() => {
  window.TWAKE_SPACE_ORIGIN = `${SPACE} http://localhost:3000`
})

afterEach(() => {
  delete window.TWAKE_SPACE_ORIGIN
  vi.restoreAllMocks()
})

describe('the embedded view', () => {
  it("lists the space's boards, without the app's navigation", async () => {
    const boardsApi = fakeBoardsApi([
      aBoard({ name: 'Roadmap', spaceId: 's1' }),
      aBoard({ name: 'Old roadmap', spaceId: 's1', archived: true }),
      aBoard({ name: 'Elsewhere', spaceId: 's2' }),
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

  it('opens a board inside the embed and comes back to the space', async () => {
    const board = aBoard({ name: 'Roadmap', spaceId: 's1' })
    const { router } = renderRoute('/embed/spaces/s1', {
      boardsApi: fakeBoardsApi([board])
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
    const board = aBoard({ name: 'Roadmap', spaceId: 's1' })
    renderRoute(`/embed/spaces/s1/boards/${board.id}?task=DES-1`, {
      boardsApi: fakeBoardsApi([board])
    })

    await screen.findByRole('link', { name: 'Back to boards' })
    const message = {
      type: 'twake-tasks:path',
      path: `/embed/spaces/s1/boards/${board.id}?task=DES-1`
    }
    expect(post).toHaveBeenCalledWith(message, SPACE)
    expect(post).toHaveBeenCalledWith(message, 'http://localhost:3000')
  })

  it('takes the theme from TwakeSpace only', async () => {
    renderRoute('/embed/spaces/s1', {
      boardsApi: fakeBoardsApi([aBoard({ spaceId: 's1' })])
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
