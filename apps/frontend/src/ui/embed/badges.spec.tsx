import { act, screen, waitFor } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from 'vitest'

import type { Notification } from '@/application/boards'
import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderBrowserRoute } from '@/testing/renderWithProviders'
import { computeBadges } from '@/ui/embed/badges'
import { connectTwakeSpace, disconnectTwakeSpace } from '@/ui/embed/twakeSpace'

const SPACE = 'https://space.example.com'

describe('computeBadges', () => {
  const projects = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]

  it('has a badge for every project, 0 when nothing is unread', () => {
    expect(
      computeBadges(projects, [
        { projectId: 'p2', count: 3 },
        { projectId: 'gone', count: 5 }
      ])
    ).toEqual([
      { resourceId: 'p1', count: 0 },
      { resourceId: 'p2', count: 3 },
      { resourceId: 'p3', count: 0 }
    ])
  })

  it('has no badge without projects', () => {
    expect(computeBadges([], [{ projectId: 'p1', count: 2 }])).toEqual([])
  })

  it('keeps the counts within what TwakeSpace accepts', () => {
    expect(
      computeBadges(projects, [
        { projectId: 'p1', count: 2_000_000 },
        { projectId: 'p2', count: -1 }
      ])
    ).toMatchObject([{ count: 1_000_000 }, { count: 0 }, { count: 0 }])
  })

  it('keeps the projects with unread notifications past 1000 projects', () => {
    const many = Array.from({ length: 1500 }, (_, index) => ({
      id: `p${String(index)}`
    }))

    const badges = computeBadges(many, [{ projectId: 'p1400', count: 4 }])

    expect(badges).toHaveLength(1)
    expect(badges).toEqual([{ resourceId: 'p1400', count: 4 }])
  })

  it('caps the snapshot at 1000 badges', () => {
    const many = Array.from({ length: 1500 }, (_, index) => ({
      id: `p${String(index)}`
    }))
    const unread = many.map(({ id }) => ({ projectId: id, count: 1 }))

    expect(computeBadges(many, unread)).toHaveLength(1000)
  })
})

describe('the badges reported to TwakeSpace', () => {
  const roadmap = aProject({ name: 'Roadmap', managed: true })
  const other = aProject({ name: 'Other', managed: true })
  const board = aBoard({ name: 'Roadmap', project: roadmap })
  const otherBoard = aBoard({ name: 'Other board', project: other })
  let frame: HTMLIFrameElement
  let post: MockInstance<Window['postMessage']>

  const unread = (boardId: string, id: string): Notification => ({
    id,
    reason: 'following',
    boardId,
    taskId: 'task',
    key: 'DES-1',
    title: 'Logo',
    createdAt: '2026-10-05T10:00:00Z',
    readAt: null
  })
  const snapshots = () =>
    post.mock.calls
      .map(([message]) => message as { type: string; badges?: unknown })
      .filter(message => message.type === 'twake-embed:badges')
      .map(message => message.badges)

  // TwakeSpace greets the frame on each of its loads: the app then knows it
  const greet = () => {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'twake-embed:hello' },
          origin: SPACE,
          source: frame.contentWindow
        })
      )
    })
  }

  function renderEmbed({
    fail = false,
    notifications = []
  }: { fail?: boolean; notifications?: Notification[] } = {}) {
    const boardsApi = fakeBoardsApi([board, otherBoard])
    boardsApi.projects.push(
      { ...roadmap, role: 'editor' },
      { ...other, role: 'editor' }
    )
    boardsApi.notifications.push(...notifications)
    if (fail) {
      boardsApi.unreadByProject.mockRejectedValue(new Error('offline'))
    }
    window.history.replaceState(null, '', `/embed/projects/${roadmap.id}`)
    connectTwakeSpace(frame.contentWindow ?? undefined)
    renderBrowserRoute({ boardsApi })
    greet()
    return boardsApi
  }

  beforeEach(() => {
    frame = document.body.appendChild(document.createElement('iframe'))
    const { contentWindow } = frame
    if (contentWindow === null) throw new Error('The frame has no window')
    post = vi.spyOn(contentWindow, 'postMessage')
  })

  afterEach(() => {
    vi.useRealTimers()
    disconnectTwakeSpace()
    frame.remove()
    window.history.replaceState(null, '', '/')
  })

  it('reports the unread notifications of every project, not only the shown one', async () => {
    renderEmbed({
      notifications: [unread(otherBoard.id, 'n1'), unread(otherBoard.id, 'n2')]
    })

    await waitFor(() => {
      expect(snapshots()).toContainEqual([
        { resourceId: roadmap.id, count: 0 },
        { resourceId: other.id, count: 2 }
      ])
    })
  })

  it('asks for nothing outside TwakeSpace', async () => {
    const boardsApi = fakeBoardsApi([board])
    boardsApi.projects.push({ ...roadmap, role: 'editor' })
    window.history.replaceState(null, '', `/embed/projects/${roadmap.id}`)
    renderBrowserRoute({ boardsApi })

    await screen.findByRole('heading', { name: 'Roadmap' })

    expect(boardsApi.unreadByProject).not.toHaveBeenCalled()
    expect(snapshots()).toEqual([])
  })

  it('sends nothing when the counts cannot be loaded', async () => {
    renderEmbed({ fail: true })

    await screen.findByRole('heading', { name: 'Roadmap' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(snapshots()).toEqual([])
  })

  it('reports again when notifications are received or read, and only then', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const boardsApi = renderEmbed()
    await waitFor(() => {
      expect(snapshots()).toHaveLength(1)
    })

    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(snapshots()).toHaveLength(1)

    boardsApi.notifications.push(unread(board.id, 'n1'))
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    await waitFor(() => {
      expect(snapshots().at(-1)).toEqual([
        { resourceId: roadmap.id, count: 1 },
        { resourceId: other.id, count: 0 }
      ])
    })

    await boardsApi.markNotificationsRead()
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    await waitFor(() => {
      expect(snapshots().at(-1)).toEqual([
        { resourceId: roadmap.id, count: 0 },
        { resourceId: other.id, count: 0 }
      ])
    })
    expect(snapshots()).toHaveLength(3)
  })

  it('reports again when a project is joined', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const boardsApi = renderEmbed()
    await waitFor(() => {
      expect(snapshots()).toHaveLength(1)
    })
    const joined = aProject({ name: 'Joined', managed: true })

    boardsApi.projects.push({ ...joined, role: 'editor' })
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    await waitFor(() => {
      expect(snapshots().at(-1)).toContainEqual({
        resourceId: joined.id,
        count: 0
      })
    })
  })

  it('reports again when a project is left', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const boardsApi = renderEmbed()
    await waitFor(() => {
      expect(snapshots()).toHaveLength(1)
    })

    boardsApi.projects.pop()
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    await waitFor(() => {
      expect(snapshots().at(-1)).toEqual([{ resourceId: roadmap.id, count: 0 }])
    })
  })
})
