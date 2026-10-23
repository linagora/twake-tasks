import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Board, Role } from '@/domain/board'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

async function openQuickAdd({
  from = (board: Board) => `/boards/${board.id}`,
  role = 'admin'
}: { from?: (board: Board) => string; role?: Role } = {}) {
  const inbox = aBoard({ name: 'Inbox', keyPrefix: 'INB', inbox: true })
  const design = aBoard({
    name: 'Product Design',
    keyPrefix: 'DES',
    role,
    members: [{ userId: 'u-ana', email: 'ana@example.com', name: 'Ana Lopez' }],
    labels: [{ id: 'l1', name: 'ops', color: null }]
  })
  const boardsApi = fakeBoardsApi([inbox, design])
  const { router } = renderRoute(from(design), { boardsApi })
  fireEvent.click(await screen.findByRole('button', { name: 'Quick add' }))
  const dialog = within(
    await screen.findByRole('dialog', { name: 'Quick add' })
  )
  const field = () => dialog.getByRole('combobox', { name: 'Task' })
  const type = (line: string) => {
    fireEvent.change(field(), { target: { value: line } })
  }
  const add = (line: string) => {
    type(line)
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
  }
  const holdNextAdd = () => {
    const real = boardsApi.createTask.getMockImplementation()
    const gate = Promise.withResolvers<undefined>()
    boardsApi.createTask.mockImplementationOnce(async (...args) => {
      await gate.promise
      return real ? real(...args) : Promise.reject(new Error('no fake'))
    })
    return () => {
      gate.resolve(undefined)
    }
  }
  const firstChip = async () => {
    const parts = within(dialog.getByRole('list', { name: 'Understood' }))
    await parts.findByRole('img', { name: /^Board / })
    return parts.getAllByRole('img')[0]
  }
  return {
    dialog,
    field,
    type,
    add,
    firstChip,
    inbox,
    design,
    holdNextAdd,
    boardsApi,
    router
  }
}

describe('QuickAdd', () => {
  it('adds a task from one line and shows it on its board', async () => {
    const { dialog, field, add } = await openQuickAdd()
    expect(field()).toHaveFocus()

    add('Logo tomorrow p1 #Product-Design')

    expect(await dialog.findByRole('status')).toHaveTextContent(
      'DES-1 added to Product Design.'
    )
    expect(field()).toHaveValue('')
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    expect(
      await screen.findByRole('button', { name: 'Logo' })
    ).toBeInTheDocument()
  })

  it('files under the board on screen, and says so', async () => {
    const { dialog, type, add, firstChip, design } = await openQuickAdd()

    type('Logo')
    expect(await firstChip()).toHaveAccessibleName('Board Product Design')
    add('Logo +ana')

    expect(await dialog.findByRole('status')).toHaveTextContent(
      'DES-1 added to Product Design.'
    )
    expect(design.tasks).toMatchObject([
      { sectionId: design.sections[0]?.id, assignees: [{ userId: 'u-ana' }] }
    ])
  })

  it('suggests the people of the board on screen', async () => {
    const { dialog, type } = await openQuickAdd()

    type('Logo +a')

    expect(
      await dialog.findByRole('option', { name: /Ana Lopez/ })
    ).toBeVisible()
  })

  it.each([
    ['another screen', { from: () => '/today' }],
    ['a board one only views', { role: 'viewer' as const }]
  ])('files under the Inbox from %s', async (_, options) => {
    const { dialog, type, add, firstChip, inbox, design } =
      await openQuickAdd(options)

    type('Logo')
    expect(await firstChip()).toHaveAccessibleName('Board Inbox')
    add('Logo')

    expect(await dialog.findByRole('status')).toHaveTextContent(
      'INB-1 added to Inbox.'
    )
    expect(inbox.tasks).toHaveLength(1)
    expect(design.tasks).toEqual([])
  })

  it('opens the added task from its key and closes', async () => {
    const { dialog, add, design, router } = await openQuickAdd({
      from: () => '/today'
    })
    add('Logo #DES')

    fireEvent.click(await dialog.findByRole('link', { name: 'DES-1' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull()
    })
    expect(router.state.location).toMatchObject({
      pathname: `/boards/${design.id}`,
      search: '?task=DES-1'
    })
  })

  it('names the board where a person is missing', async () => {
    const { dialog, add } = await openQuickAdd()

    add('Logo +bo')

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'No member named bo on Product Design.'
    )
  })

  it('names what it could not find', async () => {
    const { dialog, add, design } = await openQuickAdd()

    add('Logo #Marketing')

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'No board named Marketing.'
    )
    expect(design.tasks).toEqual([])
  })

  it('drops a refusal once the line is edited', async () => {
    const { dialog, type, add } = await openQuickAdd()
    add('Logo #Marketing')
    expect(await dialog.findByRole('alert')).toBeVisible()

    type('Logo')

    expect(dialog.queryByRole('alert')).toBeNull()
  })

  it('drops the success notice once the next line is typed', async () => {
    const { dialog, type, add } = await openQuickAdd()
    add('Logo #DES')
    expect(await dialog.findByRole('status')).toBeVisible()

    type('Next')

    expect(dialog.queryByRole('status')).toBeNull()
  })

  it('takes the focus back to the line after a click on Add', async () => {
    const { dialog, field, type } = await openQuickAdd()
    type('Logo #DES')
    const button = dialog.getByRole('button', { name: 'Add' })
    act(() => {
      button.focus()
    })
    fireEvent.click(button)

    expect(await dialog.findByRole('status')).toBeVisible()
    expect(field()).toHaveFocus()
  })

  it('keeps an add in flight when the line is edited meanwhile', async () => {
    const { dialog, field, type, add, design, holdNextAdd } =
      await openQuickAdd()
    const release = holdNextAdd()
    add('Logo #DES')
    await waitFor(() => {
      expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()
    })
    type('Logo #DES!')

    release()

    expect(await dialog.findByRole('status')).toHaveTextContent('DES-1 added')
    expect(field()).toHaveValue('')
    expect(design.tasks).toHaveLength(1)
  })

  it('keeps the success notice after a retry succeeds', async () => {
    const { dialog, add, design, boardsApi } = await openQuickAdd()
    boardsApi.createTask.mockRejectedValueOnce(new Error('offline'))
    add('Logo #DES')
    expect(await dialog.findByRole('alert')).toBeVisible()

    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))

    expect(await dialog.findByRole('status')).toHaveTextContent('DES-1 added')
    expect(design.tasks).toHaveLength(1)
  })

  it('shows what it understood as you type', async () => {
    const { dialog, type } = await openQuickAdd()

    type('Logo 3pm,p2,#DES,%ops,+ana')

    const parts = within(dialog.getByRole('list', { name: 'Understood' }))
    expect(parts.getByText('Logo')).toBeVisible()
    expect(parts.getByRole('img', { name: 'Due at 15:00' })).toBeVisible()
    expect(parts.getByRole('img', { name: 'Priority 2' })).toBeVisible()
    expect(
      parts.getByRole('img', { name: 'Board Product Design' })
    ).toBeVisible()
    expect(parts.getByText('ops')).toBeVisible()
    expect(
      await parts.findByRole('img', { name: 'Assign Ana Lopez' })
    ).toBeVisible()
  })

  it('suggests boards, sections, labels and people as you type them', async () => {
    const { dialog, field, type } = await openQuickAdd()

    type('Logo #pro')
    fireEvent.click(
      within(dialog.getByRole('listbox', { name: 'Suggestions' })).getByRole(
        'option',
        { name: /Product Design/ }
      )
    )
    expect(field()).toHaveValue('Logo #Product-Design ')

    type('Logo #Product-Design +a')
    expect(
      await dialog.findByRole('option', { name: /Ana Lopez/ })
    ).toBeVisible()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(field()).toHaveValue('Logo #Product-Design +ana ')

    type('Logo #Product-Design %o')
    expect(await dialog.findByRole('option', { name: 'ops' })).toBeVisible()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(dialog.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Quick add' })).toBeVisible()
  })

  it('highlights what was typed in each suggestion', async () => {
    const { dialog, type } = await openQuickAdd()

    type('Logo #Product-de')

    const option = within(
      dialog.getByRole('listbox', { name: 'Suggestions' })
    ).getByRole('option', { name: /Product Design/ })
    expect(
      [...option.querySelectorAll('mark')].map(mark => mark.textContent)
    ).toEqual(['Product', 'De', 'DE'])
  })

  it('keeps the syntax help behind a button', async () => {
    const { dialog } = await openQuickAdd()

    expect(dialog.queryByText(/%label/)).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Syntax help' }))

    expect(dialog.getByText(/%label/)).toBeVisible()
  })
})
