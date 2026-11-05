import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { COLORS } from '@linagora/twake-mui'
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
    await screen.findByRole('menuitem', { name: /^(Add|Change) cover$/ })
  )
  return within(await screen.findByRole('dialog', { name: 'Board cover' }))
}

const banner = () => screen.getByTestId('board-banner')

describe('board backgrounds', () => {
  it('shows no picture until an admin picks one, shown behind the breadcrumb', async () => {
    const board = aBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openPicker()
    expect(screen.queryByTestId('board-banner')).toBeNull()
    expect(picker.getByRole('button', { name: 'No cover' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(
      within(picker.getByRole('list', { name: 'Covers' }))
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual([
      'No cover',
      'Color',
      'Orbital Blue',
      'Early Morning',
      'Eclipse',
      'Dawn',
      'Stellar Burst',
      'Stripes',
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
    expect(banner()).toHaveStyle({
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
      expect(banner()).toHaveStyle({
        backgroundImage: expect.stringContaining('data:image/jpeg')
      })
    })
  })

  it('draws the cover of a board as the icon of its card', async () => {
    renderRoute('/', {
      boardsApi: fakeBoardsApi([aBoard({ background: 'dawn' })])
    })

    const icon = await screen.findByTestId('board-icon')
    expect(icon).toHaveStyle({
      backgroundImage: expect.stringContaining('url("/backgrounds/dawn.jpg")')
    })
    expect(icon).toBeEmptyDOMElement()
  })

  it('gives a space’s board without cover its initials, never a picture, and no banner', async () => {
    const board = aBoard({
      name: 'drive space',
      project: aProject({ managed: true })
    })
    renderRoute('/', { boardsApi: fakeBoardsApi([board]) })

    const icon = await screen.findByTestId('board-icon')
    expect(icon).toHaveTextContent(/^DS$/)
    expect(getComputedStyle(icon).backgroundImage).not.toContain('url(')
    fireEvent.click(screen.getByRole('link', { name: 'drive space' }))
    const picker = await openPicker()
    expect(screen.queryByTestId('board-banner')).toBeNull()
    expect(picker.getByRole('button', { name: 'No cover' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('shows no cover in an embed, nor offers one, as in Twake Space', async () => {
    const board = aBoard({ background: 'dawn' })
    renderRoute(`/embed/projects/${board.project.id}/boards/${board.id}`, {
      boardsApi: fakeBoardsApi([board])
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Board options' })
    )
    expect(await screen.findByRole('menu')).toBeVisible()
    expect(screen.queryByTestId('board-banner')).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /cover/ })).toBeNull()
  })

  it('draws the cover above the breadcrumb, never behind it', async () => {
    const board = aBoard({ background: 'dawn' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const cover = await screen.findByTestId('board-banner')
    const breadcrumb = screen.getByRole('navigation', {
      name: 'Where the page is'
    })
    expect(cover).not.toContainElement(breadcrumb)
    expect(
      cover.compareDocumentPosition(breadcrumb) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(cover).toBeEmptyDOMElement()
  })

  it.each(['list', 'calendar'] as const)(
    'shows the picture behind the breadcrumb of the %s too',
    async layout => {
      const board = aBoard({
        layout,
        defaultLayout: layout,
        background: 'dawn'
      })
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      expect(await screen.findByTestId('board-banner')).toHaveStyle({
        backgroundImage: expect.stringContaining('url("/backgrounds/dawn.jpg")')
      })
    }
  )

  it('takes a plain color instead of a picture', async () => {
    const board = aBoard({ background: 'dawn' })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openPicker()
    fireEvent.click(picker.getByRole('button', { name: 'Color' }))
    const swatch = within(screen.getByRole('dialog', { name: 'Color' }))
      .getAllByRole('radio')
      .at(1)
    if (!swatch) throw new Error('No second swatch')
    fireEvent.click(swatch)

    const color = (COLORS[1] ?? '').toUpperCase()
    await waitFor(() => {
      expect(banner()).toHaveStyle({ backgroundColor: color })
    })
    expect(boardsApi.setBackgroundColor).toHaveBeenCalledWith(board.id, color)
    expect(getComputedStyle(banner()).backgroundImage).not.toContain('url')
    expect(picker.getByRole('button', { name: 'Dawn' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(picker.getByRole('button', { name: 'Color' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('takes any color by its hex code', async () => {
    const board = aBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openPicker()
    fireEvent.click(picker.getByRole('button', { name: 'Color' }))
    const palette = within(screen.getByRole('dialog', { name: 'Color' }))
      .getAllByRole('button')
      .at(-1)
    if (!palette) throw new Error('No palette')
    fireEvent.click(palette)
    const custom = within(screen.getByRole('dialog', { name: 'Custom color' }))
    fireEvent.change(custom.getByRole('textbox', { name: 'Hex' }), {
      target: { value: 'abcdef' }
    })
    fireEvent.click(custom.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(banner()).toHaveStyle({ backgroundColor: '#ABCDEF' })
    })
    expect(boardsApi.setBackgroundColor).toHaveBeenCalledWith(
      board.id,
      '#ABCDEF'
    )
  })

  it('offers to add a cover to a board without one, to change it on others', async () => {
    const bare = aBoard({ name: 'Design' })
    const covered = aBoard({ name: 'Ops', background: 'dawn' })
    const colored = aBoard({ name: 'Roadmap', backgroundColor: '#1B2A4A' })
    const boardsApi = fakeBoardsApi([bare, covered, colored])

    for (const [board, action] of [
      [bare, 'Add cover'],
      [covered, 'Change cover'],
      [colored, 'Change cover']
    ] as const) {
      const { unmount } = renderRoute(`/boards/${board.id}`, { boardsApi })
      fireEvent.click(
        await screen.findByRole('button', { name: 'Board options' })
      )
      expect(
        await screen.findByRole('menuitem', { name: action })
      ).toBeInTheDocument()
      unmount()
    }
  })

  it('offers to add a cover from the card of a board without one', async () => {
    const bare = aBoard({ name: 'Design' })
    const covered = aBoard({ name: 'Ops', background: 'dawn' })
    renderRoute('/', { boardsApi: fakeBoardsApi([bare, covered]) })

    for (const [name, action] of [
      ['Design', 'Add cover'],
      ['Ops', 'Change cover']
    ] as const) {
      const card = within(await screen.findByRole('listitem', { name }))
      fireEvent.click(card.getByRole('button', { name: `Options for ${name}` }))
      expect(
        await screen.findByRole('menuitem', { name: action })
      ).toBeInTheDocument()
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBeNull()
      })
    }
  })

  it('closes by the cross at the top', async () => {
    const board = aBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const picker = await openPicker()
    fireEvent.click(picker.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Board cover' })).toBeNull()
    })
  })

  it('leaves the background to admins', async () => {
    const board = aBoard({ role: 'editor' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Board options' })
    )

    expect(await screen.findByRole('menu')).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Change cover' })).toBeNull()
  })
})
