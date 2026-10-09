import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from 'vitest'

import { ApiError } from '@/application/boards'
import type { Board } from '@/domain/board'
import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderBrowserRoute, renderRoute } from '@/testing/renderWithProviders'
import {
  connectTwakeSpace,
  disconnectTwakeSpace,
  getTwakeSpace
} from '@/ui/embed/twakeSpace'

const SPACE = 'https://space.example.com'
const roadmap = aProject({ name: 'Roadmap', managed: true })

function projectBoardsApi(boards: Board[]) {
  const boardsApi = fakeBoardsApi(boards)
  boardsApi.projects.push({ ...roadmap, role: 'editor' })
  return boardsApi
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the embedded view', () => {
  it("lists a project's boards, without the app's navigation", async () => {
    renderRoute(`/embed/projects/${roadmap.id}`, {
      boardsApi: projectBoardsApi([
        aBoard({ name: 'Roadmap', project: roadmap }),
        aBoard({ name: 'Launch', project: roadmap }),
        aBoard({ name: 'Old roadmap', project: roadmap, archived: true }),
        aBoard({ name: 'Elsewhere', project: aProject({ managed: true }) }),
        aBoard({ name: 'Mine' })
      ])
    })

    const list = await screen.findByRole('list', { name: 'Boards' })
    expect(
      within(list)
        .getAllByRole('link')
        .map(link => link.textContent)
    ).toEqual(['Roadmap', 'Launch'])
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('says so when the project cannot be found', async () => {
    renderRoute('/embed/projects/unknown', {
      boardsApi: projectBoardsApi([aBoard({ project: roadmap })])
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The boards could not be loaded.'
    )
  })

  it('opens the board of a project that has only one, with no way back to a list of one', async () => {
    const board = aBoard({ name: 'Roadmap', project: roadmap })
    const { router } = renderRoute(`/embed/projects/${roadmap.id}`, {
      boardsApi: projectBoardsApi([
        board,
        aBoard({ name: 'Old roadmap', project: roadmap, archived: true })
      ])
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/embed/projects/${roadmap.id}/boards/${board.id}`
      )
    })
    expect(router.state.historyAction).toBe('REPLACE')
    expect(
      await screen.findByRole('heading', { name: 'Roadmap' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Back to boards' })
    ).not.toBeInTheDocument()
  })

  it('keeps the way back on an archived board of a project with one active board', async () => {
    const old = aBoard({
      name: 'Old roadmap',
      project: roadmap,
      archived: true
    })
    renderRoute(`/embed/projects/${roadmap.id}/boards/${old.id}`, {
      boardsApi: projectBoardsApi([
        aBoard({ name: 'Roadmap', project: roadmap }),
        old
      ])
    })

    expect(
      await screen.findByRole('link', { name: 'Back to boards' })
    ).toBeInTheDocument()
  })

  it('shows the board, with no way back, when the list of boards fails to load', async () => {
    const board = aBoard({ name: 'Roadmap', project: roadmap })
    const boardsApi = projectBoardsApi([board])
    boardsApi.listBoards.mockRejectedValue(new Error('down'))
    renderRoute(`/embed/projects/${roadmap.id}/boards/${board.id}`, {
      boardsApi
    })

    expect(
      await screen.findByRole('heading', { name: 'Roadmap' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Back to boards' })
    ).not.toBeInTheDocument()
  })

  it('offers no way back from the only board of a project when it fails to load', async () => {
    const board = aBoard({ name: 'Roadmap', project: roadmap })
    const boardsApi = projectBoardsApi([board])
    boardsApi.getBoard.mockRejectedValue(new ApiError(403, null))
    renderRoute(`/embed/projects/${roadmap.id}/boards/${board.id}`, {
      boardsApi
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The board could not be loaded.'
    )
    expect(
      screen.queryByRole('link', { name: 'Back to boards' })
    ).not.toBeInTheDocument()
  })

  it('opens a board inside the project embed and comes back', async () => {
    const board = aBoard({ name: 'Roadmap', project: roadmap })
    const { router } = renderRoute(`/embed/projects/${roadmap.id}`, {
      boardsApi: projectBoardsApi([
        board,
        aBoard({ name: 'Launch', project: roadmap })
      ])
    })

    fireEvent.click(await screen.findByRole('link', { name: 'Roadmap' }))
    expect(router.state.location.pathname).toBe(
      `/embed/projects/${roadmap.id}/boards/${board.id}`
    )

    fireEvent.click(await screen.findByRole('link', { name: 'Back to boards' }))
    expect(router.state.location.pathname).toBe(`/embed/projects/${roadmap.id}`)
  })
})

describe('the history of the embedded view', () => {
  const board = aBoard({ name: 'Roadmap', project: roadmap })
  const other = aProject({ name: 'Other', managed: true })
  const otherBoard = aBoard({ name: 'Other board', project: other })
  let frame: HTMLIFrameElement
  let space: Window
  let post: MockInstance<Window['postMessage']>

  const pathMessages = () =>
    post.mock.calls
      .map(([message]) => message as { type: string })
      .filter(message => message.type === 'twake-embed:path')
  const tell = (data: unknown, origin = SPACE) => {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin,
          source: space
        })
      )
    })
  }

  const greet = (origin = SPACE) => {
    tell({ type: 'twake-embed:hello' }, origin)
  }

  function renderEmbed(path: string, { greeted = true } = {}) {
    window.history.replaceState(null, '', path)
    connectTwakeSpace(space)
    const boardsApi = projectBoardsApi([
      board,
      aBoard({ name: 'Launch', project: roadmap }),
      otherBoard
    ])
    boardsApi.projects.push({ ...other, role: 'editor' })
    const { router } = renderBrowserRoute({ boardsApi })
    if (greeted) greet()
    return router
  }

  beforeEach(() => {
    // jsdom's parent is the window itself: a frame stands for TwakeSpace
    frame = document.body.appendChild(document.createElement('iframe'))
    const { contentWindow } = frame
    if (contentWindow === null) throw new Error('The frame has no window')
    space = contentWindow
    post = vi.spyOn(space, 'postMessage')
  })

  afterEach(() => {
    disconnectTwakeSpace()
    frame.remove()
    window.history.replaceState(null, '', '/')
  })

  it('only says it is ready, to any origin, until TwakeSpace greets the frame', async () => {
    renderEmbed(`/embed/projects/${roadmap.id}/boards/${board.id}`, {
      greeted: false
    })
    await screen.findByRole('heading', { name: 'Roadmap' })

    expect(post).toHaveBeenCalled()
    for (const [message, target] of post.mock.calls) {
      expect(message).toEqual({ type: 'twake-embed:ready' })
      expect(target).toBe('*')
    }
    expect(getTwakeSpace()?.hostOrigin()).toBeNull()
  })

  it('reports the first path as a replace, to the origin that greeted', async () => {
    renderEmbed(`/embed/projects/${roadmap.id}/boards/${board.id}?task=DES-1`)

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        {
          type: 'twake-embed:path',
          resourceId: roadmap.id,
          path: `/boards/${board.id}?task=DES-1`,
          replace: true
        },
        SPACE
      )
    })
    expect(getTwakeSpace()?.hostOrigin()).toBe(SPACE)
    const targets = post.mock.calls
      .filter(
        ([message]) =>
          (message as { type: string }).type !== 'twake-embed:ready'
      )
      .map(([, target]) => target)
    expect(new Set(targets)).toEqual(new Set([SPACE]))
  })

  it('reports a user navigation as a push that adds no entry', async () => {
    renderEmbed(`/embed/projects/${roadmap.id}`)
    const link = await screen.findByRole('link', { name: 'Roadmap' })
    const length = window.history.length
    post.mockClear()

    fireEvent.click(link)

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        `/embed/projects/${roadmap.id}/boards/${board.id}`
      )
    })
    expect(window.history.length).toBe(length)
    expect(pathMessages()).toContainEqual({
      type: 'twake-embed:path',
      resourceId: roadmap.id,
      path: `/boards/${board.id}`,
      replace: false
    })
  })

  it('shows another project on load, without reporting it', async () => {
    const router = renderEmbed(`/embed/projects/${roadmap.id}`)
    await screen.findByRole('link', { name: 'Roadmap' })
    post.mockClear()

    tell({ type: 'twake-embed:load', resourceId: other.id, path: '' })

    expect(
      await screen.findByRole('heading', { name: 'Other board' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Roadmap' })).toBeNull()
    expect(router.state.location.pathname).toMatch(
      new RegExp(`^/embed/projects/${other.id}`)
    )
    expect(pathMessages()).toEqual([])
  })

  it('goes to a board of the shown project on navigate', async () => {
    const router = renderEmbed(`/embed/projects/${roadmap.id}`)
    await screen.findByRole('link', { name: 'Roadmap' })
    post.mockClear()

    tell({
      type: 'twake-embed:navigate',
      resourceId: roadmap.id,
      path: `/boards/${board.id}?task=DES-1`
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/embed/projects/${roadmap.id}/boards/${board.id}`
      )
    })
    expect(router.state.location.search).toBe('?task=DES-1')
    expect(pathMessages()).toEqual([])
  })

  it('drops a navigate meant for another project', async () => {
    const router = renderEmbed(`/embed/projects/${roadmap.id}`)
    await screen.findByRole('link', { name: 'Roadmap' })

    tell({
      type: 'twake-embed:navigate',
      resourceId: other.id,
      path: `/boards/${otherBoard.id}`
    })

    expect(router.state.location.pathname).toBe(`/embed/projects/${roadmap.id}`)
  })

  it('ignores other windows, and paths that leave the embed route', async () => {
    const router = renderEmbed(`/embed/projects/${roadmap.id}`)
    await screen.findByRole('link', { name: 'Roadmap' })

    for (const path of ['//evil.test', '/../../boards', 'boards', 3]) {
      tell({ type: 'twake-embed:load', resourceId: roadmap.id, path })
    }
    tell({ type: 'twake-embed:load', resourceId: '../x', path: '' })
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'twake-embed:load', resourceId: other.id, path: '' },
          origin: SPACE,
          source: window
        })
      )
    })

    expect(router.state.location.pathname).toBe(`/embed/projects/${roadmap.id}`)
  })
})
