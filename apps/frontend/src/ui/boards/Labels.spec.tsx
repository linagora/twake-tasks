import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const urgent = { id: 'urgent', name: 'Urgent' }

function labeledBoard() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', labels: [urgent] })
  const logo = aTask(board.sections[0] ?? null, {
    key: 'DES-1',
    title: 'Logo',
    labels: [urgent]
  })
  board.tasks = [logo]
  return { board, logo, boardsApi: fakeBoardsApi([board]) }
}

async function openLabels() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Options for DES-1' })
  )
  fireEvent.click(screen.getByRole('menuitem', { name: 'Labels' }))
  return within(await screen.findByRole('dialog', { name: 'Labels of DES-1' }))
}

const search = (
  picker: Awaited<ReturnType<typeof openLabels>>,
  text: string
) => {
  fireEvent.change(picker.getByRole('textbox', { name: 'Search labels' }), {
    target: { value: text }
  })
}

const logoCard = async () =>
  within(
    await screen.findByRole('article', { name: 'DES-1 Logo', hidden: true })
  )

describe('Labels', () => {
  it('shows a task’s labels on its card', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect((await logoCard()).getByText('Urgent')).toBeInTheDocument()
  })

  it('takes a label off the task in one click', async () => {
    const { board, logo, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    const urgentItem = picker.getByRole('menuitemcheckbox', { name: 'Urgent' })
    expect(urgentItem).toBeChecked()
    fireEvent.click(urgentItem)

    await waitFor(async () => {
      expect((await logoCard()).queryByText('Urgent')).not.toBeInTheDocument()
    })
    expect(boardsApi.setLabels).toHaveBeenCalledWith(board.id, logo.id, [])
    expect(
      screen.getByRole('dialog', { name: 'Labels of DES-1' })
    ).toBeVisible()
  })

  it('creates a label from the search text and puts it on the task', async () => {
    const { board, logo, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'Later')
    expect(
      picker.queryByRole('menuitemcheckbox', { name: 'Urgent' })
    ).not.toBeInTheDocument()
    fireEvent.click(picker.getByRole('menuitem', { name: 'Create “Later”' }))

    expect(await (await logoCard()).findByText('Later')).toBeInTheDocument()
    expect((await logoCard()).getByText('Urgent')).toBeInTheDocument()
    expect(boardsApi.createLabel).toHaveBeenCalledWith(board.id, 'Later')
    expect(boardsApi.setLabels).toHaveBeenCalledWith(board.id, logo.id, [
      urgent.id,
      expect.any(String)
    ])
  })

  it('puts the cursor in the search field', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()

    await waitFor(() => {
      expect(
        picker.getByRole('textbox', { name: 'Search labels' })
      ).toHaveFocus()
    })
  })

  it('offers to create only a name no label has', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'urgent')

    expect(
      picker.getByRole('menuitemcheckbox', { name: 'Urgent' })
    ).toBeInTheDocument()
    expect(
      picker.queryByRole('menuitem', { name: /^Create/ })
    ).not.toBeInTheDocument()
  })

  it('says when the name is taken', async () => {
    const { board, boardsApi } = labeledBoard()
    boardsApi.createLabel.mockRejectedValue(new ApiError(409, 'label_taken'))
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'Soon')
    fireEvent.click(picker.getByRole('menuitem', { name: 'Create “Soon”' }))

    expect(
      await picker.findByText('A label named Soon already exists.')
    ).toBeInTheDocument()
  })
})
