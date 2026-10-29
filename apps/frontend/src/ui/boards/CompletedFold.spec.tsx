import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const done = '2026-10-20T10:00:00.000Z'

function inbox(overrides: Parameters<typeof aBoard>[0] = {}) {
  const board = aBoard({
    name: 'Inbox',
    keyPrefix: 'INBOX',
    inbox: true,
    sections: [],
    ...overrides
  })
  board.tasks = [
    aTask(null, { key: 'INBOX-1', title: 'Renew the domain' }),
    aTask(null, { key: 'INBOX-2', title: 'Pay the bill', completedAt: done }),
    aTask(null, { key: 'INBOX-3', title: 'Book a room' })
  ]
  return board
}

describe('completed tasks outside a Done section', () => {
  it('folds them at the bottom of the column, out of its count', async () => {
    const board = inbox()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const column = within(
      await screen.findByRole('region', { name: 'No section' })
    )
    expect(column.getByText('2')).toBeVisible()
    expect(
      column.getByRole('article', { name: 'INBOX-1 Renew the domain' })
    ).toBeVisible()
    expect(
      column.queryByRole('article', { name: 'INBOX-2 Pay the bill' })
    ).toBeNull()
    const fold = column.getByRole('button', { name: '1 completed' })
    expect(fold).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(fold)

    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(
      column.getByRole('article', { name: 'INBOX-2 Pay the bill' })
    ).toBeVisible()
  })

  it('keeps the fold open on this board after a reload', async () => {
    const board = inbox()
    const boardsApi = fakeBoardsApi([board])
    const first = renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: '1 completed' }))
    first.unmount()

    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect(
      await screen.findByRole('button', { name: '1 completed' })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('article', { name: 'INBOX-2 Pay the bill' })
    ).toBeVisible()
  })

  it('leaves the tasks of a Done column in view, with no fold', async () => {
    const board = aBoard()
    const doneSection = board.sections[2] ?? null
    board.tasks = [
      aTask(doneSection, { key: 'DES-1', title: 'Logo', completedAt: done })
    ]
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const column = within(await screen.findByRole('region', { name: 'Done' }))
    expect(column.getByRole('article', { name: 'DES-1 Logo' })).toBeVisible()
    expect(column.getByText('1')).toBeVisible()
    expect(screen.queryByRole('button', { name: /completed$/ })).toBeNull()
  })

  it('folds them in the List layout too, under their section', async () => {
    const board = inbox({ layout: 'list', defaultLayout: 'list' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    expect(
      await screen.findByRole('button', { name: 'No section 2' })
    ).toBeVisible()
    expect(
      screen.queryByRole('listitem', { name: 'INBOX-2 Pay the bill' })
    ).toBeNull()
    const fold = screen.getByRole('button', { name: '1 completed' })
    expect(fold).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(fold)

    expect(
      screen.getByRole('listitem', { name: 'INBOX-2 Pay the bill' })
    ).toBeVisible()
  })
})
