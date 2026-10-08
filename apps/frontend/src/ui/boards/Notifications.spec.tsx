import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
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

  it('shows an unfollow tooltip only once the task is followed', async () => {
    const { board, boardsApi } = aBoardWithLogo()
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )

    const follow = await panel.findByRole('button', { name: 'Follow' })
    fireEvent.mouseOver(follow)
    expect(screen.queryByRole('tooltip')).toBeNull()
    const bell = follow.querySelector('svg')?.innerHTML
    fireEvent.click(follow)

    const following = await panel.findByRole('button', {
      name: 'Following'
    })
    expect(following.querySelector('svg')?.innerHTML).not.toBe(bell)
    fireEvent.mouseOver(following)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Unfollow')
    expect(following).toHaveAccessibleDescription('Unfollow')
  })
})

describe('notifications', () => {
  it('lists why each one came, links to the task, and marks them read', async () => {
    const { board, logo, boardsApi } = aBoardWithLogo()
    boardsApi.notifications.push({
      id: 'n1',
      reason: 'assigned',
      boardId: board.id,
      taskId: logo.id,
      key: 'DES-1',
      title: 'Logo',
      createdAt: '2026-10-05T10:00:00Z',
      readAt: null
    })
    renderRoute('/notifications', { boardsApi })

    const link = await screen.findByRole('link', { name: /DES-1 Logo/ })
    expect(link).toHaveAttribute('href', `/boards/${board.id}?task=DES-1`)
    expect(screen.getByText('You were assigned')).toBeVisible()
    expect(boardsApi.markNotificationsRead).toHaveBeenCalled()
  })

  it('puts unread notifications apart from the ones already seen', async () => {
    const { board, logo, boardsApi } = aBoardWithLogo()
    const about = {
      boardId: board.id,
      taskId: logo.id,
      key: 'DES-1',
      title: 'Logo'
    }
    boardsApi.notifications.push(
      {
        ...about,
        id: 'n1',
        reason: 'mentioned',
        createdAt: '2026-10-05T10:00:00Z',
        readAt: null
      },
      {
        ...about,
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
