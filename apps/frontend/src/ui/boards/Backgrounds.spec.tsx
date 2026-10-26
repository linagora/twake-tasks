import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

vi.mock('@/ui/boards/shrinkPicture', () => ({
  shrinkPicture: vi.fn(() =>
    Promise.resolve(new Blob(['small'], { type: 'image/jpeg' }))
  )
}))

async function openPicker() {
  fireEvent.click(await screen.findByRole('button', { name: 'Board options' }))
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Change background' })
  )
  return within(await screen.findByRole('dialog', { name: 'Board background' }))
}

const columns = () => screen.getByTestId('columns')

describe('board backgrounds', () => {
  it('stays white until an admin picks a picture, shown behind the columns', async () => {
    const board = aBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openPicker()
    expect(getComputedStyle(columns()).backgroundImage).not.toContain('url')
    expect(
      picker.getByRole('button', { name: 'No background' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(picker.getByRole('list', { name: 'Backgrounds' }))
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual([
      'No background',
      'Orbital Blue',
      'Early Morning',
      'Dawn',
      'Stellar Burst',
      'Blossom',
      'Lagoon',
      'Ripple',
      'From my computer'
    ])
    fireEvent.click(picker.getByRole('button', { name: 'Dawn' }))

    await waitFor(() => {
      expect(picker.getByRole('button', { name: 'Dawn' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    })
    expect(boardsApi.setBackground).toHaveBeenCalledWith(board.id, 'dawn')
    expect(columns()).toHaveStyle({
      backgroundImage: expect.stringContaining('url("/backgrounds/dawn.jpg")')
    })
  })

  it('sends a picture from the computer, shrunk, then shows it', async () => {
    const board = aBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openPicker()
    const picture = new File(['big'], 'holidays.png', { type: 'image/png' })
    fireEvent.change(picker.getByLabelText('From my computer'), {
      target: { files: [picture] }
    })

    expect(
      await picker.findByRole('button', { name: 'My picture' })
    ).toHaveAttribute('aria-pressed', 'true')
    const [boardId, sent] = boardsApi.setBackgroundImage.mock.calls[0] ?? []
    expect(boardId).toBe(board.id)
    expect(sent?.type).toBe('image/jpeg')
    await waitFor(() => {
      expect(columns()).toHaveStyle({
        backgroundImage: expect.stringContaining('data:image/jpeg')
      })
    })
  })

  it('takes a space’s picture by default on a space’s board, and its card', async () => {
    const board = aBoard({ project: aProject({ managed: true }) })
    const boardsApi = fakeBoardsApi([board])
    renderRoute('/', { boardsApi })

    expect(await screen.findByTestId('board-cover')).toHaveStyle({
      backgroundImage: expect.stringContaining('url("/backgrounds/space.jpg")')
    })
    fireEvent.click(screen.getByRole('link', { name: 'Design' }))
    const picker = await openPicker()
    expect(picker.getByRole('button', { name: 'Space' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(columns()).toHaveStyle({
      backgroundImage: expect.stringContaining('url("/backgrounds/space.jpg")')
    })
  })

  it('draws Breeze on the card of a white board, and keeps the board white', async () => {
    const board = aBoard()
    renderRoute('/', { boardsApi: fakeBoardsApi([board]) })

    expect(await screen.findByTestId('board-cover')).toHaveStyle({
      backgroundImage: expect.stringContaining('/backgrounds/breeze.jpg')
    })
    fireEvent.click(screen.getByRole('link', { name: 'Design' }))
    expect(
      getComputedStyle(await screen.findByTestId('columns')).backgroundImage
    ).not.toContain('url')
  })

  it('leaves the background to admins', async () => {
    const board = aBoard({ role: 'editor' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Board options' })
    )

    expect(await screen.findByRole('menu')).toBeVisible()
    expect(
      screen.queryByRole('menuitem', { name: 'Change background' })
    ).toBeNull()
  })

  it('writes the name dark on the card of a pale picture', async () => {
    const pale = aBoard({ name: 'Design', background: 'blossom' })
    const dark = aBoard({ name: 'Ops', background: 'dawn' })
    renderRoute('/', { boardsApi: fakeBoardsApi([pale, dark]) })

    const coverOf = async (name: string) =>
      within(await screen.findByRole('listitem', { name })).getByTestId(
        'board-cover'
      )
    const paleCover = await coverOf('Design')
    const darkCover = await coverOf('Ops')
    // The white name of a dark picture is shadowed, a dark one is not.
    expect(getComputedStyle(paleCover).textShadow).not.toContain('0.55')
    expect(getComputedStyle(darkCover).textShadow).toContain('0.55')
  })
})
