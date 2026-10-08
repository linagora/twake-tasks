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
import { aBoard, aProject, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderBrowserRoute } from '@/testing/renderWithProviders'
import { computeMetadata, countTasks } from '@/ui/embed/metadata'
import { connectTwakeSpace, disconnectTwakeSpace } from '@/ui/embed/twakeSpace'

const SPACE = 'https://space.example.com'

const summary = (
  projectId: string,
  doneTasks: number,
  totalTasks: number,
  archived = false
) => ({ project: { id: projectId }, archived, doneTasks, totalTasks })

describe('countTasks', () => {
  it('sums the tasks of the active boards of each project', () => {
    expect(
      countTasks([
        summary('p1', 1, 4),
        summary('p1', 2, 3),
        summary('p1', 5, 5, true),
        summary('p2', 0, 2)
      ])
    ).toEqual(
      new Map([
        ['p1', { done: 3, total: 7 }],
        ['p2', { done: 0, total: 2 }]
      ])
    )
  })
})

describe('computeMetadata', () => {
  const projects = [{ id: 'p1' }, { id: 'p2' }]

  it('has the badge and the tasks of every project, 0 for a project without boards', () => {
    expect(
      computeMetadata(
        projects,
        [
          { projectId: 'p2', count: 3 },
          { projectId: 'gone', count: 5 }
        ],
        [summary('p1', 2, 5), summary('gone', 1, 1)]
      )
    ).toEqual([
      { resourceId: 'p1', name: 'badge', value: 0 },
      { resourceId: 'p1', name: 'tasks.done', value: 2 },
      { resourceId: 'p1', name: 'tasks.total', value: 5 },
      { resourceId: 'p2', name: 'badge', value: 3 },
      { resourceId: 'p2', name: 'tasks.done', value: 0 },
      { resourceId: 'p2', name: 'tasks.total', value: 0 }
    ])
  })

  it('has only the badges until the boards are known', () => {
    expect(computeMetadata(projects, [], null)).toEqual([
      { resourceId: 'p1', name: 'badge', value: 0 },
      { resourceId: 'p2', name: 'badge', value: 0 }
    ])
  })

  it('keeps the values within what TwakeSpace accepts', () => {
    expect(
      computeMetadata(
        [{ id: 'p1' }],
        [{ projectId: 'p1', count: -1 }],
        [summary('p1', 2_000_000, 2_000_000)]
      ).map(({ value }) => value)
    ).toEqual([0, 1_000_000, 1_000_000])
  })

  it('caps the snapshot at 1000 entries, projects with unread notifications first', () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
      id: `p${String(index)}`
    }))

    const metadata = computeMetadata(
      many,
      [{ projectId: 'p399', count: 4 }],
      []
    )

    expect(metadata).toHaveLength(999)
    expect(metadata[0]).toEqual({ resourceId: 'p399', name: 'badge', value: 4 })
  })
})

describe('the metadata reported to TwakeSpace', () => {
  const roadmap = aProject({ name: 'Roadmap', managed: true })
  const other = aProject({ name: 'Other', managed: true })
  const done = aTask(null, { completedAt: '2026-10-05T10:00:00Z' })
  const open = aTask(null)
  const board = aBoard({
    name: 'Roadmap',
    project: roadmap,
    tasks: [done, open]
  })
  const otherBoard = aBoard({ name: 'Other board', project: other })
  let frame: HTMLIFrameElement
  let post: MockInstance<Window['postMessage']>

  const unread = (boardId: string): Notification => ({
    id: 'n1',
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
      .map(([message]) => message as { type: string; metadata?: unknown })
      .filter(message => message.type === 'twake-embed:metadata')
      .map(message => message.metadata)

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
    const boardsApi = fakeBoardsApi([structuredClone(board), otherBoard])
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

  it('reports the badge and the tasks of every project, and the badges still', async () => {
    renderEmbed({ notifications: [unread(otherBoard.id)] })

    await waitFor(() => {
      expect(snapshots()).toContainEqual([
        { resourceId: roadmap.id, name: 'badge', value: 0 },
        { resourceId: roadmap.id, name: 'tasks.done', value: 1 },
        { resourceId: roadmap.id, name: 'tasks.total', value: 2 },
        { resourceId: other.id, name: 'badge', value: 1 },
        { resourceId: other.id, name: 'tasks.done', value: 0 },
        { resourceId: other.id, name: 'tasks.total', value: 0 }
      ])
    })
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'twake-embed:badges' }),
      SPACE
    )
  })

  it('sends nothing when the unread notifications cannot be loaded', async () => {
    renderEmbed({ fail: true })

    await screen.findByRole('heading', { name: 'Roadmap' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(snapshots()).toEqual([])
  })

  it('reports again when a task is done elsewhere, and only then', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const boardsApi = renderEmbed()
    await waitFor(() => {
      expect(snapshots().at(-1)).toContainEqual({
        resourceId: roadmap.id,
        name: 'tasks.done',
        value: 1
      })
    })
    const count = snapshots().length

    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(snapshots()).toHaveLength(count)

    await boardsApi.completeTask(board.id, open.id, 'completed')
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    await waitFor(() => {
      expect(snapshots().at(-1)).toContainEqual({
        resourceId: roadmap.id,
        name: 'tasks.done',
        value: 2
      })
    })
    expect(snapshots()).toHaveLength(count + 1)
  })
})
