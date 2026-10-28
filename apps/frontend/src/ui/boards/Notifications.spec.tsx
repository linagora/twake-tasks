import {
  act,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Notification } from '@/application/boards'
import {
  aBoard,
  aNotification,
  aTask,
  fakeBoardsApi
} from '@/testing/fakeBoardsApi'
import { followZone } from '@/ui/boards/dueLabel'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'

function aBoardWithLogo() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  return { board, logo, boardsApi: fakeBoardsApi([board]) }
}

describe('following a task', () => {
  it('follows and unfollows from the task panel', async () => {
    const { board, logo, boardsApi } = aBoardWithLogo()
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )

    const follow = await panel.findByRole('button', { name: 'Follow' })
    fireEvent.click(follow)

    const following = await panel.findByRole('button', {
      name: 'Following'
    })
    expect(following).toBeVisible()
    expect(panel.queryByRole('button', { name: 'Follow' })).toBeNull()
    expect(boardsApi.setFollowing).toHaveBeenCalledWith(board.id, logo.id, true)

    fireEvent.click(following)
    expect(await panel.findByRole('button', { name: 'Follow' })).toBeVisible()
    expect(boardsApi.setFollowing).toHaveBeenLastCalledWith(
      board.id,
      logo.id,
      false
    )
  })

  it('is an eye alone, crossed out until followed, named by its label', async () => {
    const { board, boardsApi } = aBoardWithLogo()
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )

    const follow = await panel.findByRole('button', { name: 'Follow' })
    expect(follow).toHaveTextContent('')
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    fireEvent.mouseOver(follow)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Follow')
    const crossed = follow.querySelector('svg')?.innerHTML
    fireEvent.mouseLeave(follow)
    await waitForElementToBeRemoved(tooltip)
    fireEvent.click(follow)

    const following = await panel.findByRole('button', {
      name: 'Following'
    })
    expect(following).toHaveTextContent('')
    expect(following.querySelector('svg')?.innerHTML).not.toBe(crossed)
    expect(following).toHaveAttribute('aria-pressed', 'true')
    fireEvent.mouseOver(following)
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Unfollow')
    })
    expect(following).toHaveAccessibleDescription('Unfollow')
  })

  it('sends no second request while the first is pending', async () => {
    const { board, logo, boardsApi } = aBoardWithLogo()
    const request = Promise.withResolvers<undefined>()
    boardsApi.setFollowing.mockReturnValueOnce(request.promise)
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )

    fireEvent.click(await panel.findByRole('button', { name: 'Follow' }))
    fireEvent.click(await panel.findByRole('button', { name: 'Following' }))
    await act(() => Promise.resolve())
    expect(boardsApi.setFollowing).toHaveBeenCalledTimes(1)
    expect(boardsApi.setFollowing).toHaveBeenCalledWith(board.id, logo.id, true)

    request.resolve(undefined)
    expect(
      await panel.findByRole('button', { name: 'Following' })
    ).toBeVisible()
  })
})

describe('notifications', () => {
  const alice = {
    userId: 'alice',
    email: 'alice@example.com',
    name: 'Alice Martin',
    avatar: null
  }

  function anInbox(...notifications: Partial<Notification>[]) {
    const { board, logo, boardsApi } = aBoardWithLogo()
    boardsApi.notifications.push(
      ...notifications.map(notification =>
        aNotification({
          boardId: board.id,
          boardName: 'Product launch',
          taskId: logo.id,
          ...notification
        })
      )
    )
    return { board, boardsApi }
  }

  const rowOf = async () =>
    screen.findByRole('listitem', { name: 'DES-1 Logo' })

  it('says who assigned the task and links to it', async () => {
    const { board, boardsApi } = anInbox({ reason: 'assigned', actor: alice })
    renderRoute('/notifications', { boardsApi })

    const row = await rowOf()
    expect(row).toHaveTextContent('Alice Martin assigned you')
    expect(row).toHaveTextContent('DES-1 · Product launch')
    expect(within(row).getByText('AM')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Logo' })).toHaveAttribute(
      'href',
      `/boards/${board.id}?task=DES-1`
    )
  })

  describe('reading them', () => {
    const twoUnread = () =>
      anInbox(
        { id: 'n2', createdAt: '2026-10-05T11:00:00Z' },
        { id: 'n1', createdAt: '2026-10-05T10:00:00Z' }
      )
    const fresh = async () =>
      within(await screen.findByRole('region', { name: 'New' }))

    it('keeps them unread while the page is only visited', async () => {
      const { boardsApi } = twoUnread()
      renderRoute('/notifications', { boardsApi })

      expect((await fresh()).getAllByRole('listitem')).toHaveLength(2)
      await act(() => Promise.resolve())
      expect(boardsApi.markNotificationsRead).not.toHaveBeenCalled()
      expect(boardsApi.markNotificationRead).not.toHaveBeenCalled()
    })

    it('marks read the one notification opened', async () => {
      const { boardsApi } = twoUnread()
      renderRoute('/notifications', { boardsApi })

      const [, older] = (await fresh()).getAllByRole('link', { name: 'Logo' })
      if (!older) throw new Error('two links expected')
      fireEvent.click(older)

      await waitFor(() => {
        expect(boardsApi.markNotificationRead).toHaveBeenCalledWith('n1')
      })
      expect(boardsApi.markNotificationsRead).not.toHaveBeenCalled()
    })

    it('marks read all the ones shown, and none received since', async () => {
      const { boardsApi } = twoUnread()
      renderRoute('/notifications', { boardsApi })
      await fresh()
      const since = aNotification({ id: 'n3', taskId: 'other' })
      boardsApi.notifications.push(since)

      fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))

      const earlier = within(
        await screen.findByRole('region', { name: 'Earlier' })
      )
      expect(earlier.getAllByRole('listitem')).toHaveLength(2)
      expect(boardsApi.markNotificationsRead).toHaveBeenCalledWith(['n2', 'n1'])
      expect(since.readAt).toBeNull()
    })

    it('offers no mark all once everything is read', async () => {
      const { boardsApi } = anInbox({ readAt: '2026-10-06T10:00:00Z' })
      renderRoute('/notifications', { boardsApi })

      await rowOf()
      expect(
        screen.queryByRole('button', { name: 'Mark all as read' })
      ).toBeNull()
    })
  })

  it('tells the reader they were unassigned', async () => {
    const { boardsApi } = anInbox({ reason: 'unassigned', actor: alice })
    renderRoute('/notifications', { boardsApi })

    expect(await rowOf()).toHaveTextContent('Alice Martin unassigned you')
  })

  it.each([
    { lang: 'en', sentence: 'Alice Martin set the priority to P1' },
    { lang: 'fr', sentence: 'Alice Martin a mis la priorité à P1' }
  ] as const)(
    'says what changed on a followed task as its history does ($lang)',
    async ({ lang, sentence }) => {
      const { boardsApi } = anInbox({
        actor: alice,
        change: {
          actor: alice,
          field: 'priority',
          from: null,
          to: 1,
          name: null,
          at: '2026-10-05T10:00:00Z'
        }
      })
      renderRoute('/notifications', { boardsApi, lang })

      expect(await rowOf()).toHaveTextContent(sentence)
    }
  )

  it('says a followed task changed when the change is no longer known', async () => {
    const { boardsApi } = anInbox({ actor: alice, change: null })
    renderRoute('/notifications', { boardsApi })

    expect(await rowOf()).toHaveTextContent('Changed while you follow it')
  })

  it('quotes the comment that mentions the reader', async () => {
    const { boardsApi } = anInbox({
      reason: 'mentioned',
      actor: alice,
      commentExcerpt: 'Can you check the colours?'
    })
    renderRoute('/notifications', { boardsApi })

    const row = await rowOf()
    expect(row).toHaveTextContent('Alice Martin mentioned you')
    expect(row).toHaveTextContent('Can you check the colours?')
  })

  it('shows a reminder with its clock and nobody behind it', async () => {
    const { boardsApi } = anInbox({ reason: 'reminder' })
    renderRoute('/notifications', { boardsApi })

    const row = await rowOf()
    expect(row).toHaveTextContent('Reminder')
    expect(within(row).queryByText('AM')).toBeNull()
  })

  it('tells the time relative to now, with the exact moment on hover', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
    followZone('UTC')
    try {
      const { boardsApi } = anInbox({ createdAt: '2026-10-23T11:55:00Z' })
      renderRoute('/notifications', { boardsApi })

      const time = within(await rowOf()).getByText('5 min ago')
      expect(time).toHaveAttribute('title', 'Oct 23, 2026, 11:55')
    } finally {
      vi.useRealTimers()
      followZone(null)
    }
  })

  it('puts unread notifications apart from the ones already seen', async () => {
    const { boardsApi } = anInbox(
      { id: 'n1', reason: 'mentioned', readAt: null },
      {
        id: 'n2',
        reason: 'assigned',
        createdAt: '2026-10-01T10:00:00Z',
        readAt: '2026-10-02T10:00:00Z'
      }
    )
    renderRoute('/notifications', { boardsApi })

    const fresh = await screen.findByRole('region', { name: 'New' })
    expect(within(fresh).getByRole('listitem')).toHaveTextContent(
      'You were mentioned'
    )
    const seen = screen.getByRole('region', { name: 'Earlier' })
    expect(within(seen).getByRole('listitem')).toHaveTextContent(
      'You were assigned'
    )
  })

  it('says when there are none', async () => {
    renderRoute('/notifications', { boardsApi: fakeBoardsApi() })

    expect(await findEmptyState('No notifications')).toHaveTextContent(
      'Follow a task to hear about its changes here.'
    )
  })
})
