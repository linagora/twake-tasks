import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

let downloads: { name: string; blob: Blob }[] = []

beforeEach(() => {
  downloads = []
  let blob: Blob | undefined
  URL.createObjectURL = vi.fn((created: Blob) => {
    blob = created
    return 'blob:csv'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    if (blob) downloads.push({ name: this.download, blob })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function aBoardWithTasks(role: 'admin' | 'viewer' = 'admin') {
  const board = aBoard({ role })
  const [todo = null] = board.sections
  board.tasks = [
    aTask(todo, { key: 'DES-1', title: '=Logo', priority: 1 }),
    aTask(todo, { key: 'DES-2', title: 'Colors' })
  ]
  const boardsApi = fakeBoardsApi([board])
  renderRoute(`/boards/${board.id}`, { boardsApi })
  return { board, boardsApi }
}

async function openMenuItem(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Board options' }))
  const menu = within(await screen.findByRole('menu'))
  const canImport = menu.queryByRole('menuitem', { name: 'Import from CSV' })
  fireEvent.click(menu.getByRole('menuitem', { name }))
  return { dialog: within(await screen.findByRole('dialog')), canImport }
}

describe('a board in a CSV file', () => {
  it('downloads the tasks, safe to open in a spreadsheet', async () => {
    const { board, boardsApi } = aBoardWithTasks('viewer')
    const { dialog, canImport } = await openMenuItem('Export to CSV')
    expect(canImport).toBeNull()
    fireEvent.click(
      dialog.getByRole('checkbox', { name: 'Include archived tasks' })
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Download' }))

    await waitFor(() => {
      expect(downloads).toHaveLength(1)
    })
    expect(boardsApi.exportTasks).toHaveBeenCalledWith(board.id, true)
    const [file] = downloads
    expect(file?.name).toMatch(/^Design \d{4}-\d{2}-\d{2}\.csv$/)
    const [header = '', first = ''] =
      (await file?.blob.text())?.replace('\u{FEFF}', '').split('\r\n') ?? []
    expect(header).toMatch(/^Key,Title,Section,Done,.*,Link,Archived$/)
    expect(first).toMatch(/^DES-1,'=Logo,To do,no,,,P1,/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('imports the tasks of a file, and offers the rows it skipped', async () => {
    const { board, boardsApi } = aBoardWithTasks()
    const { dialog } = await openMenuItem('Import from CSV')
    const csv =
      'Card Name;List Name;Priority\nFonts;In progress;P2\n;Done;\nIcons;Nowhere;\n'
    fireEvent.change(dialog.getByLabelText('Choose a CSV file'), {
      target: { files: [new File([csv], 'trello.csv', { type: 'text/csv' })] }
    })

    expect(await dialog.findByRole('combobox', { name: 'Title' })).toHaveValue(
      '0'
    )
    expect(dialog.getByRole('combobox', { name: 'Section' })).toHaveValue('1')
    const preview = within(dialog.getByRole('list', { name: 'Preview' }))
    expect(preview.getAllByRole('listitem')).toHaveLength(2)
    expect(preview.getByText('In progress · P2')).toBeVisible()
    expect(preview.getByText('Nowhere')).toBeVisible()
    expect(dialog.getByText('1 row will be skipped.')).toBeVisible()

    fireEvent.click(dialog.getByRole('button', { name: 'Import 2 tasks' }))

    expect(await dialog.findByRole('status')).toHaveTextContent(
      '2 tasks imported. 1 row skipped.'
    )
    expect(boardsApi.importTasks).toHaveBeenCalledWith(board.id, [
      { title: 'Fonts', section: 'In progress', priority: 2 },
      { title: 'Icons', section: 'Nowhere' }
    ])
    fireEvent.click(
      dialog.getByRole('button', { name: 'Download skipped rows' })
    )
    const text = await downloads[0]?.blob.text()
    expect(downloads[0]?.name).toBe('trello skipped.csv')
    expect(text).toContain(
      'Card Name,List Name,Priority,Reason\r\n,Done,,"No title, or a title'
    )
    expect(await screen.findByText('Fonts')).toBeVisible()
  })

  it('refuses a file with too many tasks', async () => {
    aBoardWithTasks()
    const { dialog } = await openMenuItem('Import from CSV')
    const csv = `Title\n${'Task\n'.repeat(1001)}`
    fireEvent.change(dialog.getByLabelText('Choose a CSV file'), {
      target: { files: [new File([csv], 'big.csv')] }
    })
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Import at most 1 000 tasks at a time.'
    )
  })
})
