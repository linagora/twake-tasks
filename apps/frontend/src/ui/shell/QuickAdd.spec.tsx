import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

async function openQuickAdd() {
  const inbox = aBoard({ name: 'Inbox', keyPrefix: 'INB', inbox: true })
  const design = aBoard({
    name: 'Product Design',
    keyPrefix: 'DES',
    members: [{ userId: 'u-ana', email: 'ana@example.com' }],
    labels: [{ id: 'l1', name: 'ops' }]
  })
  const boardsApi = fakeBoardsApi([inbox, design])
  renderRoute(`/boards/${design.id}`, { boardsApi })
  fireEvent.click(
    within(await screen.findByRole('banner')).getByRole('button', {
      name: 'Quick add'
    })
  )
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
  return { dialog, field, type, add, design }
}

describe('QuickAdd', () => {
  it('adds a task from one line and shows it on its board', async () => {
    const { dialog, field, add } = await openQuickAdd()
    expect(field()).toHaveFocus()

    add('Logo tomorrow p1 #Product-Design')

    expect(await dialog.findByText('DES-1 added.')).toBeVisible()
    expect(field()).toHaveValue('')
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    expect(
      await screen.findByRole('button', { name: 'Logo' })
    ).toBeInTheDocument()
  })

  it('names what it could not find', async () => {
    const { dialog, add, design } = await openQuickAdd()

    add('Logo #Marketing')

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'No board named Marketing.'
    )
    expect(design.tasks).toEqual([])
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
      await parts.findByRole('img', { name: 'Assign ana@example.com' })
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
      await dialog.findByRole('option', { name: /ana@example.com/ })
    ).toBeVisible()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(field()).toHaveValue('Logo #Product-Design +ana ')

    type('Logo #Product-Design %o')
    expect(await dialog.findByRole('option', { name: 'ops' })).toBeVisible()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(dialog.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Quick add' })).toBeVisible()
  })

  it('keeps the syntax help behind a button', async () => {
    const { dialog } = await openQuickAdd()

    expect(dialog.queryByText(/%label/)).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Syntax help' }))

    expect(dialog.getByText(/%label/)).toBeVisible()
  })
})
