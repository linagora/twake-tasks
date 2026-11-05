import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { localToday } from '@/ui/boards/dueLabel'

function daysFromToday(days: number): string {
  const day = new Date(`${localToday()}T12:00:00`)
  day.setDate(day.getDate() + days)
  return day.toLocaleDateString('en-CA')
}

function launchBoard() {
  const board = aBoard({ name: 'Launch', background: 'dawn' })
  const [todo, started, done] = board.sections
  board.tasks = [
    aTask(todo ?? null, { key: 'LAU-1', dueDate: daysFromToday(-2) }),
    aTask(todo ?? null, { key: 'LAU-2', dueDate: daysFromToday(3) }),
    aTask(started ?? null, { key: 'LAU-3' }),
    aTask(done ?? null, { key: 'LAU-4' })
  ]
  return board
}

function reducedMotion(): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: media.includes('prefers-reduced-motion: reduce'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined
  }))
}

function scrollTo(top: number): void {
  const host = document.getElementById('content')?.children[1]
  if (!(host instanceof HTMLElement)) throw new Error('No scroll host')
  Object.defineProperties(host, {
    scrollTop: { configurable: true, value: top },
    scrollHeight: { configurable: true, value: 2000 },
    clientHeight: { configurable: true, value: 800 }
  })
  fireEvent.scroll(host)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the board hero', () => {
  it('shows the numbers of the board, live', async () => {
    reducedMotion()
    const board = launchBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const numbers = within(
      await screen.findByRole('list', { name: 'The board at a glance' })
    )
    expect(
      numbers.getAllByRole('listitem').map(item => item.textContent)
    ).toEqual([
      '3 open',
      '1 late',
      '25% done',
      expect.stringMatching(/^Next due /)
    ])
    expect(
      screen.getByRole('progressbar', { name: 'Progress' })
    ).toHaveAttribute('aria-valuetext', '1 done, 1 in progress, 1 late')

    act(() => {
      boardsApi.changeElsewhere(board.id, changed => {
        const late = changed.tasks.find(task => task.key === 'LAU-1')
        if (late) late.sectionId = changed.sections[2]?.id ?? null
      })
    })

    expect(await numbers.findByText('50%')).toBeInTheDocument()
    expect(
      numbers.getAllByRole('listitem').map(item => item.textContent)
    ).toEqual([
      '2 open',
      '0 late',
      '50% done',
      expect.stringMatching(/^Next due /)
    ])
  })

  it.each([
    ['counts up to a new number', false, '3'],
    ['shows a new number at once when motion is reduced', true, '5']
  ])('%s', async (_name, reduced, first) => {
    if (reduced) reducedMotion()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) =>
      frames.push(frame)
    )
    const board = launchBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const numbers = within(
      await screen.findByRole('list', { name: 'The board at a glance' })
    )
    const open = () =>
      numbers.getAllByRole('listitem')[0]?.querySelector('strong')?.textContent

    act(() => {
      boardsApi.changeElsewhere(board.id, changed => {
        changed.tasks.push(aTask(changed.sections[0] ?? null))
        changed.tasks.push(aTask(changed.sections[0] ?? null))
      })
    })
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '17'
      )
    })
    expect(open()).toBe(first)

    act(() => {
      for (const now of [0, 100, 200]) frames.shift()?.(now)
    })
    expect(open()).toBe('5')
  })

  it('collapses into a bar while the page scrolls, and expands at the top', async () => {
    const board = launchBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    const numbers = await screen.findByRole('list', {
      name: 'The board at a glance'
    })
    expect(numbers).toBeVisible()
    const hero = screen.getByTestId('board-hero')
    expect(hero).toHaveAttribute('data-collapsed', 'false')

    act(() => {
      scrollTo(400)
    })

    expect(hero).toHaveAttribute('data-collapsed', 'true')
    expect(
      within(hero).getByText('1', { selector: 'p > strong' }).parentElement
    ).toHaveTextContent('1 late')
    expect(
      screen.queryByRole('list', { name: 'The board at a glance' })
    ).toBeNull()
    expect(within(hero).getByRole('button', { name: 'Share' })).toBeVisible()

    act(() => {
      scrollTo(0)
    })

    expect(hero).toHaveAttribute('data-collapsed', 'false')
    expect(
      screen.getByRole('list', { name: 'The board at a glance' })
    ).toBeVisible()
  })

  it('keeps the same buttons in every layout, Share first', async () => {
    const board = launchBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const layouts = within(await screen.findByRole('group', { name: 'Layout' }))
    const hero = screen.getByTestId('board-hero')
    const buttons = () =>
      within(hero)
        .getAllByRole('button')
        .map(button => button.getAttribute('aria-label') ?? button.textContent)

    const kanban = buttons()
    const share = kanban.indexOf('Share')
    expect(kanban.slice(share, share + 2)).toEqual(['Share', 'Filter'])
    for (const layout of ['List', 'Calendar', 'Progress']) {
      fireEvent.click(layouts.getByRole('button', { name: layout }))
      await waitFor(() => {
        expect(layouts.getByRole('button', { name: layout })).toHaveAttribute(
          'aria-pressed',
          'true'
        )
      })
      expect(buttons()).toEqual(kanban)
    }
    expect(within(hero).getByRole('button', { name: 'Filter' })).toBeDisabled()
  })

  it('holds the place of the header and its numbers while the board loads', async () => {
    const board = launchBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.getBoard.mockImplementation(() => new Promise(() => undefined))
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const hero = await screen.findByTestId('board-hero')
    expect(
      await within(hero).findByRole('heading', { name: 'Launch' })
    ).toBeInTheDocument()
    expect(within(hero).getByTestId('board-hero-numbers')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Loading' })
    ).not.toContainElement(hero)
  })

  it('keeps a gap under the header of an empty board in an embed', async () => {
    const board = aBoard({ name: 'Launch' })
    renderRoute(`/embed/projects/${board.project.id}/boards/${board.id}`, {
      boardsApi: fakeBoardsApi([board])
    })

    const hero = (
      await screen.findByRole('heading', { name: 'Launch' })
    ).closest('[data-testid="board-hero"]')
    expect(
      screen.queryByRole('list', { name: 'The board at a glance' })
    ).toBeNull()
    expect(hero).toHaveStyle({ marginBottom: 'var(--twake-spacing)' })
  })
})
