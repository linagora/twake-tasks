import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DriveCancelledError,
  type Drive,
  type DriveFile
} from '@/application/drive'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const brief: DriveFile = {
  url: 'https://alice-drive.example.com/public?sharecode=brief',
  name: 'brief.pdf',
  mimeType: 'application/pdf',
  size: 2400,
  driveFileId: 'file-brief'
}

function baseDrive() {
  return {
    pick: vi.fn<Drive['pick']>((_container, _labels, onReadyToUse) => {
      onReadyToUse()
      return { files: Promise.resolve([brief]), stop: vi.fn() }
    }),
    upload: vi.fn<Drive['upload']>(file =>
      Promise.resolve({
        url: `https://alice-drive.example.com/public?sharecode=${file.name}`,
        name: file.name,
        mimeType: file.type || null,
        size: file.size,
        driveFileId: `id-${file.name}`
      })
    )
  }
}

function fakeDrive(overrides: Partial<ReturnType<typeof baseDrive>> = {}) {
  return { ...baseDrive(), ...overrides }
}

function logoBoard({
  role = 'admin',
  teamDriveId = null
}: { role?: 'admin' | 'viewer'; teamDriveId?: string | null } = {}) {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', role, teamDriveId })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  return { board, logo, boardsApi }
}

async function openLogo() {
  fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
  return within(await screen.findByRole('dialog', { name: 'DES-1 Logo' }))
}

const aFile = (name: string, type = 'image/png') =>
  new File(['x'.repeat(1500)], name, { type })

async function chooseFromComputer(files: File[]) {
  const panel = within(screen.getByRole('dialog', { name: 'DES-1 Logo' }))
  fireEvent.click(await panel.findByRole('button', { name: 'Add a file' }))
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'From my computer' })
  )
  fireEvent.change(panel.getByLabelText('From my computer'), {
    target: { files }
  })
}

// A link shows once the list is fetched again and the dialogs over the panel closed.
const findChip = (name: string) =>
  screen.findByRole('button', { name: `Open ${name}` }, { timeout: 5000 })

describe('TaskFiles', () => {
  it('shows the files linked to the task, and opens one in a new tab', async () => {
    const { board, logo, boardsApi } = logoBoard()
    boardsApi.files.set(logo.id, [
      {
        id: 'f1',
        ...brief,
        addedBy: 'alice',
        createdAt: '2026-10-20T09:00:00Z'
      }
    ])
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderRoute(`/boards/${board.id}`, { boardsApi, drive: fakeDrive() })

    await openLogo()
    fireEvent.click(await findChip('brief.pdf'))

    expect(open).toHaveBeenCalledWith(
      brief.url,
      '_blank',
      'noopener,noreferrer'
    )
    open.mockRestore()
  })

  it('links the files picked in Twake Drive', async () => {
    const { board, logo, boardsApi } = logoBoard()
    const choice = Promise.withResolvers<DriveFile[]>()
    const drive = fakeDrive({
      pick: vi.fn<Drive['pick']>((_container, _labels, onReadyToUse) => {
        onReadyToUse()
        return { files: choice.promise, stop: vi.fn() }
      })
    })
    renderRoute(`/boards/${board.id}`, { boardsApi, drive })

    const panel = await openLogo()
    fireEvent.click(await panel.findByRole('button', { name: 'Add a file' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'From Twake Drive' })
    )
    expect(
      await screen.findByRole('dialog', { name: 'Pick files in Twake Drive' })
    ).toBeInTheDocument()
    choice.resolve([brief])

    expect(await findChip('brief.pdf')).toBeInTheDocument()
    expect(drive.pick).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      { addLabel: 'Add to the task' },
      expect.any(Function)
    )
    expect(boardsApi.addFiles).toHaveBeenCalledWith(board.id, logo.id, [brief])
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Pick files in Twake Drive' })
      ).toBe(null)
    })
  })

  it('uploads the files of the computer to the Project folder, then links them', async () => {
    const { board, logo, boardsApi } = logoBoard()
    const drive = fakeDrive()
    renderRoute(`/boards/${board.id}`, { boardsApi, drive })

    const panel = await openLogo()
    await chooseFromComputer([aFile('mockup.png'), aFile('notes.txt')])

    expect(await findChip('mockup.png')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Open notes.txt' })).toBeVisible()
    expect(drive.upload).toHaveBeenCalledTimes(2)
    expect(drive.upload.mock.calls[0]?.[1]).toEqual({ kind: 'personal' })
    expect(boardsApi.addFiles).toHaveBeenCalledTimes(1)
    expect(
      boardsApi.addFiles.mock.calls[0]?.[2].map(file => file.name)
    ).toEqual(['mockup.png', 'notes.txt'])
    expect(boardsApi.addFiles.mock.calls[0]?.[1]).toBe(logo.id)
  })

  it('shows each upload with its size, as Twake Mail does', async () => {
    const { board, boardsApi } = logoBoard()
    const drive = fakeDrive({
      upload: vi.fn<Drive['upload']>(() => new Promise(() => undefined))
    })
    renderRoute(`/boards/${board.id}`, { boardsApi, drive })

    await openLogo()
    await chooseFromComputer([aFile('mockup.png')])

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Adding files' })
    )
    expect(
      dialog.getByText(
        /uploaded to the Project folder of your Twake Drive and added to the task as/
      )
    ).toBeInTheDocument()
    const row = within(dialog.getByRole('listitem', { name: 'mockup.png' }))
    expect(row.getByRole('status')).toHaveTextContent('1.5 kB')
    // The cross of the header and the button under the rows, as in Twake Mail.
    expect(dialog.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2)
  })

  it('sends the files of a space board to the drive of the space', async () => {
    const { board, boardsApi } = logoBoard({ teamDriveId: 'drive-space' })
    const drive = fakeDrive()
    renderRoute(`/boards/${board.id}`, { boardsApi, drive })

    await openLogo()
    await chooseFromComputer([aFile('mockup.png')])

    await waitFor(() => {
      expect(drive.upload).toHaveBeenCalledWith(
        expect.any(File),
        { kind: 'team', driveId: 'drive-space' },
        expect.any(AbortSignal)
      )
    })
  })

  it('links nothing of an upload cancelled from its row', async () => {
    const { board, boardsApi } = logoBoard()
    const drive = fakeDrive({
      upload: vi.fn<Drive['upload']>(
        (_file, _destination, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new DriveCancelledError())
            })
          })
      )
    })
    renderRoute(`/boards/${board.id}`, { boardsApi, drive })

    await openLogo()
    await chooseFromComputer([aFile('mockup.png')])
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Adding files' })
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel mockup.png' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Adding files' })).toBe(null)
    })
    expect(boardsApi.addFiles).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBe(null)
  })

  it('says so when a file could not be uploaded, and links the others', async () => {
    const { board, boardsApi } = logoBoard()
    const working = fakeDrive()
    const drive = fakeDrive({
      upload: vi.fn<Drive['upload']>((file, destination, signal) =>
        file.name === 'broken.png'
          ? Promise.reject(new Error('quota exceeded'))
          : working.upload(file, destination, signal)
      )
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderRoute(`/boards/${board.id}`, { boardsApi, drive })

    const panel = await openLogo()
    await chooseFromComputer([aFile('broken.png'), aFile('fine.png')])

    expect(
      await screen.findByText('Some files could not be added to the task.')
    ).toBeInTheDocument()
    expect(await findChip('fine.png')).toBeVisible()
    expect(panel.queryByRole('button', { name: 'Open broken.png' })).toBe(null)
  })

  it('unlinks a file without touching the drive', async () => {
    const { board, logo, boardsApi } = logoBoard()
    boardsApi.files.set(logo.id, [
      {
        id: 'f1',
        ...brief,
        addedBy: 'alice',
        createdAt: '2026-10-20T09:00:00Z'
      }
    ])
    const drive = fakeDrive()
    renderRoute(`/boards/${board.id}`, { boardsApi, drive })

    const panel = await openLogo()
    fireEvent.click(await panel.findByLabelText('Remove brief.pdf'))

    await waitFor(() => {
      expect(panel.queryByRole('button', { name: 'Open brief.pdf' })).toBe(null)
    })
    expect(boardsApi.removeFile).toHaveBeenCalledWith(board.id, logo.id, 'f1')
  })

  it('shows the files to a viewer without letting them change any', async () => {
    const { board, logo, boardsApi } = logoBoard({ role: 'viewer' })
    boardsApi.files.set(logo.id, [
      {
        id: 'f1',
        ...brief,
        addedBy: 'alice',
        createdAt: '2026-10-20T09:00:00Z'
      }
    ])
    renderRoute(`/boards/${board.id}`, { boardsApi, drive: fakeDrive() })

    const panel = await openLogo()

    expect(await findChip('brief.pdf')).toBeVisible()
    expect(panel.queryByRole('button', { name: 'Add a file' })).toBe(null)
    expect(panel.queryByLabelText('Remove brief.pdf')).toBe(null)
  })

  it('offers no way to add a file without a Twake Workplace platform', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi, drive: null })

    const panel = await openLogo()
    await panel.findByRole('region', { name: 'Description' })

    expect(panel.queryByRole('region', { name: 'Files' })).toBe(null)
    expect(panel.queryByRole('button', { name: 'Add a file' })).toBe(null)
  })
})
