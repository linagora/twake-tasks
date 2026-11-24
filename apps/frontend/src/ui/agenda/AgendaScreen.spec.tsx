import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'
import { formatDay, localToday, localZone } from '@/ui/boards/dueLabel'

// Each render of a row highlights its title once.
const titleRenders = vi.hoisted(() => new Map<string, number>())
vi.mock(import('@/ds/Highlight'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    Highlight: (props: Parameters<typeof actual.Highlight>[0]) => {
      titleRenders.set(props.text, (titleRenders.get(props.text) ?? 0) + 1)
      return actual.Highlight(props)
    }
  }
})

const day = (offset: number) => {
  const date = new Date(`${localToday()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function boards() {
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  design.tasks = [
    aTask(null, { key: 'DES-1', title: 'Logo', dueDate: day(0) }),
    aTask(null, { key: 'DES-2', title: 'Poster', dueDate: day(-2) }),
    aTask(null, { key: 'DES-3', title: 'Flyer', dueDate: day(3) })
  ]
  return { design, boardsApi: fakeBoardsApi([design]) }
}

describe('AgendaScreen', () => {
  it('shows overdue and today’s tasks, each opening over Today', async () => {
    const { boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    const overdue = within(
      await screen.findByRole('region', { name: 'Overdue' })
    )
    fireEvent.click(overdue.getByRole('button', { name: 'Poster' }))
    // Its full page opens over Today, which its breadcrumb starts from.
    const panel = within(
      await screen.findByRole('dialog', { name: /^DES-2 Poster/ })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Open as full page' }))
    const crumbs = within(
      panel.getByRole('navigation', { name: 'Where the task is' })
    )
    expect(crumbs.getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '/today'
    )
    expect(crumbs.getByText('DES-2')).toHaveAttribute('aria-current', 'page')
    fireEvent.click(panel.getByRole('button', { name: 'Close' }))
    const today = within(screen.getByRole('region', { name: 'Today' }))
    expect(today.getByText('Logo')).toBeVisible()
    expect(screen.queryByText('Flyer')).not.toBeInTheDocument()
    expect(boardsApi.agenda).toHaveBeenCalledWith(localZone(), 1)
  })

  it('names the Inbox of a task in the language of the interface', async () => {
    const inbox = aBoard({ name: 'Inbox', keyPrefix: 'INBOX', inbox: true })
    inbox.tasks = [
      aTask(null, { key: 'INBOX-1', title: 'Renouveler', dueDate: day(0) })
    ]
    renderRoute('/today', { boardsApi: fakeBoardsApi([inbox]), lang: 'fr' })

    const row = within(
      await screen.findByRole('listitem', { name: 'INBOX-1 Renouveler' })
    )
    expect(
      await row.findByText('INBOX-1 · Boîte de réception')
    ).toBeInTheDocument()
  })

  it('links the task opened from Today to its board, named with its project', async () => {
    const { design, boardsApi } = boards()
    design.project.name = 'Product launch'
    const { router } = renderRoute('/today', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: /^DES-1 Logo/ })
    )
    await waitFor(() => {
      expect(panel.getAllByRole('term')[0]).toHaveTextContent('Board')
    })
    const value = panel.getAllByRole('term')[0]?.nextElementSibling
    expect(value).toHaveTextContent('Design · Product launch')
    fireEvent.click(
      within(value as HTMLElement).getByRole('link', { name: 'Design' })
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/boards/${design.id}`)
    })
  })

  it('opens a sub-task over the task opened from Today', async () => {
    const { design, boardsApi } = boards()
    design.tasks.push(
      aTask(null, {
        key: 'DES-4',
        title: 'Sketch',
        parentId: design.tasks[1]?.id ?? null
      })
    )
    renderRoute('/today', { boardsApi })

    // Pressed from the keyboard, as jsdom focuses nothing on a click.
    const press = (button: HTMLElement) => {
      button.focus()
      fireEvent.click(button)
    }
    press(await screen.findByRole('button', { name: 'Poster' }))
    const panel = within(
      await screen.findByRole('dialog', { name: /^DES-2 Poster/ })
    )
    press(await panel.findByRole('button', { name: 'Sketch' }))

    const sketch = await screen.findByRole('dialog', { name: /^DES-4 Sketch/ })
    expect(
      screen.getByRole('dialog', { name: /^DES-2 Poster/ })
    ).toBeInTheDocument()
    fireEvent.click(within(sketch).getByRole('button', { name: 'Close' }))
    const poster = await screen.findByRole('dialog', { name: /^DES-2 Poster/ })

    // Focus goes back to where each task was opened from.
    await waitFor(() => {
      expect(
        within(poster).getByRole('button', { name: 'Sketch' })
      ).toHaveFocus()
    })
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape'
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Poster' })).toHaveFocus()
  })

  it('refreshes Today once the task opened over it closes', async () => {
    const { boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Poster' }))
    const panel = within(
      await screen.findByRole('dialog', { name: /^DES-2 Poster/ })
    )
    await waitFor(() => {
      expect(boardsApi.agenda).toHaveBeenCalledTimes(1)
    })
    const title = panel.getByRole('textbox', { name: 'Title' })
    fireEvent.change(title, { target: { value: 'Big poster' } })
    fireEvent.blur(title)
    await waitFor(() => {
      expect(boardsApi.editTask).toHaveBeenCalled()
    })
    // A change keeps the task open, even one that takes it off Today.
    expect(boardsApi.agenda).toHaveBeenCalledTimes(1)

    fireEvent.click(panel.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(boardsApi.agenda).toHaveBeenCalledTimes(2)
    })
  })

  it('does not render the other rows again when a task opens and closes', async () => {
    const { boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    await screen.findByRole('button', { name: 'Logo' })
    const before = titleRenders.get('Logo')
    fireEvent.click(screen.getByRole('button', { name: 'Poster' }))
    const panel = within(
      await screen.findByRole('dialog', { name: /^DES-2 Poster/ })
    )
    await panel.findAllByRole('term')
    fireEvent.click(panel.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(titleRenders.get('Logo')).toBe(before)
  })

  it('keeps Today as it is when the open task is clicked again', async () => {
    const { boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Poster' }))
    await screen.findByRole('dialog', { name: /^DES-2 Poster/ })
    await waitFor(() => {
      expect(boardsApi.agenda).toHaveBeenCalledTimes(1)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Poster' }))
    fireEvent.click(screen.getByRole('button', { name: 'Logo' }))

    await screen.findByRole('dialog', { name: /^DES-1 Logo/ })
    await waitFor(() => {
      expect(boardsApi.agenda).toHaveBeenCalledTimes(2)
    })
  })

  it('shows the key, board, priority, assignees and labels of each task', async () => {
    const { design, boardsApi } = boards()
    design.tasks[0] = aTask(null, {
      key: 'DES-1',
      title: 'Logo',
      dueDate: day(0),
      priority: 1,
      assignees: [
        { userId: 'u1', email: 'ana@example.com', name: 'Ana Lopez' }
      ],
      labels: [{ id: 'l1', name: 'client', color: null }]
    })
    renderRoute('/today', { boardsApi })

    const row = within(await screen.findByRole('listitem', { name: /Logo/ }))

    expect(row.getByText('DES-1 · Design')).toBeVisible()
    expect(row.getByRole('img', { name: 'Priority 1' })).toBeVisible()
    expect(
      row.getByRole('img', { name: 'Assigned to Ana Lopez' })
    ).toBeVisible()
    expect(row.getByText('client')).toBeVisible()
  })

  it('leaves the day out of rows already grouped by day', async () => {
    const { boardsApi } = boards()
    renderRoute('/upcoming', { boardsApi })

    const flyer = within(await screen.findByRole('listitem', { name: /Flyer/ }))
    expect(flyer.queryByLabelText(/due /i)).toBeNull()
    expect(
      within(screen.getByRole('listitem', { name: /Poster/ })).getByLabelText(
        /^Overdue, due /
      )
    ).toBeVisible()
  })

  it('shows the next seven days on Upcoming', async () => {
    const { boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    fireEvent.click(
      within(await screen.findByRole('list', { name: 'Main menu' })).getByRole(
        'link',
        {
          name: 'Upcoming'
        }
      )
    )

    expect(await screen.findByText('Flyer')).toBeVisible()
    expect(boardsApi.agenda).toHaveBeenLastCalledWith(localZone(), 7)
  })

  it('shows Upcoming over 14 or 30 days, and keeps the choice', async () => {
    const { design, boardsApi } = boards()
    design.tasks.push(
      aTask(null, { key: 'DES-4', title: 'Launch', dueDate: day(9) })
    )
    const { unmount } = renderRoute('/upcoming', { boardsApi })

    const span = within(
      await screen.findByRole('group', { name: 'Days shown' })
    )
    expect(span.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(await screen.findByText('Flyer')).toBeVisible()
    expect(screen.queryByText('Launch')).not.toBeInTheDocument()

    fireEvent.click(span.getByRole('button', { name: '14 days' }))
    expect(
      within(
        await screen.findByRole('region', { name: formatDay(day(9), 'en') })
      ).getByText('Launch')
    ).toBeVisible()
    expect(boardsApi.agenda).toHaveBeenLastCalledWith(localZone(), 14)
    unmount()

    renderRoute('/upcoming', { boardsApi })
    expect(
      within(
        await screen.findByRole('group', { name: 'Days shown' })
      ).getByRole('button', { name: '14 days' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Launch')).toBeVisible()
  })

  it('lists the tasks assigned to me, undated ones last', async () => {
    const { design, boardsApi } = boards()
    const me = { userId: 'me', email: 'me@example.com', name: null }
    design.tasks.push(
      aTask(null, { key: 'DES-4', title: 'Brief', assignees: [me] }),
      aTask(null, {
        key: 'DES-5',
        title: 'Mockups',
        dueDate: day(5),
        assignees: [me]
      })
    )
    renderRoute('/mine', { boardsApi })

    expect(
      within(await screen.findByRole('region', { name: 'No date' })).getByText(
        'Brief'
      )
    ).toBeVisible()
    expect(screen.getByText('Mockups')).toBeVisible()
    expect(screen.queryByText('Logo')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Main menu' })).getByRole(
        'link',
        {
          name: 'My tasks'
        }
      )
    ).toHaveAttribute('href', '/mine')
  })

  it('says which tasks Today, Upcoming and My tasks hold', async () => {
    const { boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    expect(await screen.findByText('Logo')).toBeVisible()
    expect(
      screen.getByText(
        'Tasks assigned to you, and unassigned tasks of your boards outside spaces.'
      )
    ).toBeVisible()
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Main menu' })).getByRole(
        'link',
        { name: 'My tasks' }
      )
    )
    expect(
      await screen.findByText('Open tasks assigned to you on any board.')
    ).toBeVisible()
  })

  it.each([
    ['/today', 'Nothing due today', 0],
    ['/upcoming', 'Nothing due in the coming days', 1]
  ])(
    'offers to create a task when %s says "%s", due on day +%i',
    async (path, title, offset) => {
      const { router } = renderRoute(path, { boardsApi: fakeBoardsApi() })

      const empty = within(await findEmptyState(title))
      expect(
        screen.getAllByText(
          'Tasks assigned to you, and unassigned tasks of your boards outside spaces.'
        )
      ).toHaveLength(1)
      expect(screen.queryByText('You are all caught up.')).toBeNull()
      fireEvent.click(empty.getByRole('button', { name: 'Create task' }))

      expect(
        await screen.findByRole('dialog', { name: 'Create a task' })
      ).toBeVisible()
      expect(router.state.location.search).toBe(`?new=task&due=${day(offset)}`)
    }
  )

  it('offers to create a task when nothing is assigned to me', async () => {
    const { router } = renderRoute('/mine', { boardsApi: fakeBoardsApi() })

    const empty = await findEmptyState('Nothing assigned to you')
    expect(
      screen.getByText('Open tasks assigned to you on any board.')
    ).toBeVisible()
    fireEvent.click(within(empty).getByRole('button', { name: 'Create task' }))

    expect(
      await screen.findByRole('dialog', { name: 'Create a task' })
    ).toBeVisible()
    expect(router.state.location.search).toBe('?new=task&assign=me')
  })

  describe('quick actions of My tasks', () => {
    const me = { userId: 'me', email: 'me@example.com', name: null }
    const rowOf = async (name: string) =>
      within(await screen.findByRole('listitem', { name }))

    it('moves a late task to today, or a day after its due date', async () => {
      const design = aBoard({ keyPrefix: 'DES' })
      const [toDo] = design.sections
      design.tasks = [
        aTask(toDo ?? null, {
          key: 'DES-1',
          title: 'Poster',
          dueDate: day(-2),
          deadline: day(-1),
          assignees: [me]
        }),
        aTask(null, {
          key: 'DES-2',
          title: 'Flyer',
          dueDate: day(3),
          assignees: [me]
        })
      ]
      const boardsApi = fakeBoardsApi([design])
      renderRoute('/mine', { boardsApi })

      const flyer = await rowOf('DES-2 Flyer')
      expect(
        flyer.queryByRole('button', { name: 'Move to today' })
      ).not.toBeInTheDocument()
      fireEvent.click(flyer.getByRole('button', { name: 'Push by a day' }))
      await waitFor(() => {
        expect(boardsApi.editTask).toHaveBeenCalledWith(
          design.id,
          design.tasks[1]?.id,
          { dueDate: day(4) }
        )
      })

      const poster = await rowOf('DES-1 Poster')
      fireEvent.click(poster.getByRole('button', { name: 'Move to today' }))
      expect(
        within(await screen.findByRole('region', { name: 'Today' })).getByText(
          'Poster'
        )
      ).toBeVisible()
      // The deadline keeps its gap to the due date.
      expect(boardsApi.editTask).toHaveBeenLastCalledWith(
        design.id,
        design.tasks[0]?.id,
        { dueDate: day(0), deadline: day(1) }
      )
    })

    it('marks a task done, in its board’s Done section when it has sections', async () => {
      const design = aBoard({ keyPrefix: 'DES' })
      const [toDo, , done] = design.sections
      const posterTask = aTask(toDo ?? null, {
        key: 'DES-1',
        title: 'Poster',
        assignees: [me]
      })
      const flyerTask = aTask(null, {
        key: 'DES-2',
        title: 'Flyer',
        assignees: [me]
      })
      design.tasks = [posterTask, flyerTask]
      const boardsApi = fakeBoardsApi([design])
      renderRoute('/mine', { boardsApi })

      const poster = await rowOf('DES-1 Poster')
      expect(
        poster.queryByRole('button', { name: 'Push by a day' })
      ).not.toBeInTheDocument()
      fireEvent.click(poster.getByRole('button', { name: 'Mark as done' }))
      await waitFor(() => {
        expect(screen.queryByText('Poster')).not.toBeInTheDocument()
      })
      expect(boardsApi.moveTask).toHaveBeenCalledWith(
        design.id,
        posterTask.id,
        { sectionId: done?.id }
      )

      fireEvent.click(
        (await rowOf('DES-2 Flyer')).getByRole('button', {
          name: 'Mark as done'
        })
      )
      await waitFor(() => {
        expect(screen.queryByText('Flyer')).not.toBeInTheDocument()
      })
      expect(boardsApi.completeTask).toHaveBeenCalledWith(
        design.id,
        flyerTask.id,
        'completed'
      )
    })

    it('says a task marked done is still blocked', async () => {
      const design = aBoard({ keyPrefix: 'DES' })
      design.tasks = [
        aTask(null, {
          key: 'DES-2',
          title: 'Flyer',
          assignees: [me],
          blockers: [{ key: 'DES-1', title: 'Poster' }]
        })
      ]
      renderRoute('/mine', { boardsApi: fakeBoardsApi([design]) })

      fireEvent.click(
        (await rowOf('DES-2 Flyer')).getByRole('button', {
          name: 'Mark as done'
        })
      )
      expect(
        await screen.findByText('DES-2 is still blocked by DES-1.')
      ).toBeVisible()
    })

    it('says when the board has no Done section to complete the task in', async () => {
      const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
      design.sections = design.sections.filter(
        section => section.category !== 'completed'
      )
      design.tasks = [
        aTask(design.sections[0] ?? null, {
          key: 'DES-1',
          title: 'Poster',
          assignees: [me]
        })
      ]
      const boardsApi = fakeBoardsApi([design])
      renderRoute('/mine', { boardsApi })

      fireEvent.click(
        (await rowOf('DES-1 Poster')).getByRole('button', {
          name: 'Mark as done'
        })
      )
      expect(
        await screen.findByText(
          'Design has no Done section to move the task to.'
        )
      ).toBeVisible()
      expect(boardsApi.moveTask).not.toHaveBeenCalled()
    })

    it('offers none on a board I only view', async () => {
      const design = aBoard({ keyPrefix: 'DES', role: 'viewer' })
      design.tasks = [
        aTask(null, { key: 'DES-1', title: 'Poster', assignees: [me] })
      ]
      const web = aBoard({ name: 'Web', keyPrefix: 'WEB' })
      web.tasks = [
        aTask(null, { key: 'WEB-1', title: 'Landing', assignees: [me] })
      ]
      renderRoute('/mine', { boardsApi: fakeBoardsApi([design, web]) })

      expect(
        await (
          await rowOf('WEB-1 Landing')
        ).findByRole('button', { name: 'Mark as done' })
      ).toBeVisible()
      const poster = await rowOf('DES-1 Poster')
      expect(poster.queryByRole('button', { name: 'Mark as done' })).toBeNull()
    })
  })

  it('shows placeholders while the tasks load', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.agenda.mockReturnValue(new Promise(() => undefined))
    renderRoute('/today', { boardsApi })

    expect(
      await screen.findByRole('progressbar', { name: 'Loading' })
    ).toBeInTheDocument()
  })
})
