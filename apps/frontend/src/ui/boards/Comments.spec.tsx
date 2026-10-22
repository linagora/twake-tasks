import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/application/boards'
import { throwConfetti } from '@/ds/confetti'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { typeRichText } from '@/testing/richText'

// A canvas animation, which jsdom cannot draw.
vi.mock('@/ds/confetti', () => ({ throwConfetti: vi.fn() }))

const alice = {
  userId: 'alice',
  email: 'alice@example.com',
  name: 'Alice Martin'
}
const albert = {
  userId: 'albert',
  email: 'albert@example.com',
  name: 'Albert Roux'
}

function logoBoard(role: 'admin' | 'viewer' = 'admin') {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', role })
  board.members = [
    alice,
    albert,
    { userId: 'jean', email: 'jean_dupont@example.com', name: 'Jean Dupont' }
  ]
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  boardsApi.comments.set(logo.id, [
    {
      id: 'c1',
      author: { userId: 'bob', email: 'bob@example.com', name: 'Bob Durand' },
      body: 'Which palette?',
      createdAt: '2026-10-05T09:00:00Z',
      reactions: []
    }
  ])
  return { board, logo, boardsApi }
}

async function openLogo() {
  fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
  return within(await screen.findByRole('dialog', { name: 'DES-1 Logo' }))
}

describe('Comments', () => {
  it('shows who said what on a task', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const comment = within(
      await (await openLogo()).findByRole('article', { name: 'Bob Durand' })
    )

    expect(comment.getByText('Which palette?')).toBeInTheDocument()
  })

  it('keeps the old comments but hides the composer on an archived board', async () => {
    const { board, boardsApi } = logoBoard()
    board.archived = true
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(
      await panel.findByRole('article', { name: 'Bob Durand' })
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Send' })
    ).not.toBeInTheDocument()
  })

  it("shows the author's Twake Workplace avatar", async () => {
    const { board, logo, boardsApi } = logoBoard()
    const [first] = boardsApi.comments.get(logo.id) ?? []
    if (first) first.author.avatar = 'https://avatars.example.com/bob.png'
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    await panel.findByRole('article', { name: 'Bob Durand' })

    expect(
      panel
        .getAllByRole('img', { hidden: true })
        .map(img => img.getAttribute('src'))
    ).toContain('https://avatars.example.com/bob.png')
  })

  it('says when a comment mentions too many people, and keeps it to edit', async () => {
    const { board, boardsApi } = logoBoard()
    boardsApi.addComment.mockRejectedValueOnce(
      new ApiError(400, 'too_many_mentions')
    )
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const editor = await panel.findByRole('textbox', { name: 'Comment' })
    await typeRichText(editor, 'Everyone, look.')
    fireEvent.click(panel.getByRole('button', { name: 'Send' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'This comment mentions too many people. Mention fewer and send it again.'
    )
    expect(editor).toHaveTextContent('Everyone, look.')
  })

  it('lets a viewer add a comment', async () => {
    const { board, logo, boardsApi } = logoBoard('viewer')
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    await typeRichText(
      await panel.findByRole('textbox', { name: 'Comment' }),
      'The new one.'
    )
    fireEvent.click(panel.getByRole('button', { name: 'Send' }))

    expect(
      await panel.findByRole('article', { name: 'me@example.com' })
    ).toHaveTextContent('The new one.')
    await waitFor(() => {
      expect(panel.getByRole('textbox', { name: 'Comment' })).toHaveTextContent(
        ''
      )
    })
    expect(boardsApi.addComment).toHaveBeenCalledWith(
      board.id,
      logo.id,
      'The new one.'
    )
  })

  it('shows formatting written in a comment', async () => {
    const { board, logo, boardsApi } = logoBoard()
    boardsApi.comments.set(logo.id, [
      {
        id: 'c2',
        author: { userId: 'bob', email: 'bob@example.com', name: null },
        body: 'Use the **new** one:\n\n- [x] logo\n- [ ] icons',
        createdAt: '2026-10-05T09:00:00Z',
        reactions: []
      }
    ])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const comment = within(
      await (
        await openLogo()
      ).findByRole('article', { name: 'bob@example.com' })
    )

    expect(await comment.findByText('new')).toContainHTML('new')
    expect(comment.getByText('new').tagName).toBe('STRONG')
    expect(comment.getAllByRole('checkbox')).toHaveLength(2)
  })

  describe('mentions', () => {
    async function typeInComment(text: string) {
      const { board, logo, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })
      const panel = await openLogo()
      const editor = await panel.findByRole('textbox', { name: 'Comment' })
      editor.focus()
      await typeRichText(editor, text)
      return { board, logo, boardsApi, panel, editor }
    }

    it('suggests the members as @ is typed and inserts the one chosen', async () => {
      const { board, logo, boardsApi, panel, editor } =
        await typeInComment('Thanks @ali')

      const list = await screen.findByRole('listbox', {
        name: 'People to mention'
      })
      expect(within(list).getAllByRole('option')).toHaveLength(1)
      fireEvent.click(
        within(list).getByRole('option', {
          name: 'Alice Martin alice@example.com'
        })
      )

      await waitFor(() => {
        expect(editor).toHaveTextContent('Thanks @Alice Martin')
      })
      expect(within(editor).getByText('@Alice Martin')).toHaveAttribute(
        'title',
        'alice@example.com'
      )
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      fireEvent.click(panel.getByRole('button', { name: 'Send' }))
      await waitFor(() => {
        expect(boardsApi.addComment).toHaveBeenCalledWith(
          board.id,
          logo.id,
          'Thanks @alice@example.com'
        )
      })
    })

    it('puts a space after the mention and keeps typing from there', async () => {
      const { editor } = await typeInComment('@ali')

      fireEvent.click(
        within(await screen.findByRole('listbox')).getByRole('option')
      )

      await waitFor(() => {
        expect(editor.textContent).toBe('@Alice Martin ')
      })
      expect(editor.querySelectorAll('a')).toHaveLength(0)
    })

    it('moves with the arrows and picks with Enter without sending', async () => {
      const { boardsApi, editor } = await typeInComment('@al')
      const list = await screen.findByRole('listbox')
      const options = within(list).getAllByRole('option')
      // The person writing comes last: mentioning yourself tells nobody
      expect(options.map(option => option.textContent)).toEqual([
        expect.stringContaining('Albert Roux'),
        expect.stringContaining('Jean Dupont'),
        expect.stringContaining('Alice Martin')
      ])
      expect(options[0]).toHaveAttribute('aria-selected', 'true')

      fireEvent.keyDown(editor, { key: 'ArrowDown' })
      options.forEach((option, index) => {
        expect(option).toHaveAttribute('aria-selected', String(index === 1))
      })
      fireEvent.keyDown(editor, { key: 'ArrowDown' })
      options.forEach((option, index) => {
        expect(option).toHaveAttribute('aria-selected', String(index === 2))
      })
      fireEvent.keyDown(editor, { key: 'ArrowDown' })
      options.forEach((option, index) => {
        expect(option).toHaveAttribute('aria-selected', String(index === 0))
      })
      fireEvent.keyDown(editor, { key: 'ArrowUp' })
      options.forEach((option, index) => {
        expect(option).toHaveAttribute('aria-selected', String(index === 2))
      })
      fireEvent.keyDown(editor, { key: 'ArrowUp' })
      options.forEach((option, index) => {
        expect(option).toHaveAttribute('aria-selected', String(index === 1))
      })
      fireEvent.keyDown(editor, { key: 'Enter' })

      await waitFor(() => {
        expect(editor.textContent).toBe('@Jean Dupont ')
      })
      expect(editor.querySelectorAll('p')).toHaveLength(1)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(boardsApi.addComment).not.toHaveBeenCalled()
    })

    it('keeps an email with an underscore as the backend reads it', async () => {
      const { board, logo, boardsApi, panel, editor } =
        await typeInComment('@jean')
      fireEvent.keyDown(editor, { key: 'Enter' })
      await waitFor(() => {
        expect(editor.textContent).toBe('@Jean Dupont ')
      })
      fireEvent.click(panel.getByRole('button', { name: 'Send' }))
      await waitFor(() => {
        expect(boardsApi.addComment).toHaveBeenCalledWith(
          board.id,
          logo.id,
          '@jean_dupont@example.com'
        )
      })
    })

    it('picks with Tab', async () => {
      const { editor } = await typeInComment('@alb')
      await screen.findByRole('listbox')

      fireEvent.keyDown(editor, { key: 'Tab' })

      await waitFor(() => {
        expect(editor.textContent).toBe('@Albert Roux ')
      })
    })

    it('picks instead of sending on Ctrl+Enter while the list is open', async () => {
      const { boardsApi, editor } = await typeInComment('@alb')
      await screen.findByRole('listbox')

      fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

      await waitFor(() => {
        expect(editor.textContent).toBe('@Albert Roux ')
      })
      expect(boardsApi.addComment).not.toHaveBeenCalled()
    })

    it('sends on Ctrl+Enter once the list is closed', async () => {
      const { board, logo, boardsApi, editor } =
        await typeInComment('Looks good')

      fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

      await waitFor(() => {
        expect(boardsApi.addComment).toHaveBeenCalledWith(
          board.id,
          logo.id,
          'Looks good'
        )
      })
    })

    it('closes the list on Escape and keeps what was typed', async () => {
      const { boardsApi, editor } = await typeInComment('@al')
      await screen.findByRole('listbox')

      fireEvent.keyDown(editor, { key: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
      expect(editor).toHaveTextContent('@al')
      expect(screen.getByRole('dialog', { name: 'DES-1 Logo' })).toBeVisible()
      expect(boardsApi.addComment).not.toHaveBeenCalled()
    })

    it('shows nothing when no member matches', async () => {
      const { editor } = await typeInComment('@zzz')

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(editor).not.toHaveAttribute('aria-controls')
    })

    it('does not suggest inside an email address', async () => {
      await typeInComment('write to bob@ali')

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('announces the suggestions to a screen reader', async () => {
      const { editor } = await typeInComment('Hi')
      expect(editor).toHaveAttribute('aria-haspopup', 'listbox')
      expect(editor).toHaveAttribute('aria-autocomplete', 'list')
      // aria-expanded is not allowed on a textbox (ARIA 1.2)
      expect(editor).not.toHaveAttribute('aria-expanded')
      expect(editor).not.toHaveAttribute('aria-controls')

      await typeRichText(editor, 'Hi @al')

      const list = await screen.findByRole('listbox')
      const [first, second] = within(list).getAllByRole('option')
      expect(editor).toHaveAttribute('aria-controls', list.id)
      expect(editor).toHaveAttribute('aria-activedescendant', first?.id)
      fireEvent.keyDown(editor, { key: 'ArrowDown' })
      expect(editor).toHaveAttribute('aria-activedescendant', second?.id)
      fireEvent.keyDown(editor, { key: 'Escape' })
      await waitFor(() => {
        expect(editor).not.toHaveAttribute('aria-controls')
      })
      expect(editor).not.toHaveAttribute('aria-activedescendant')
    })

    it('puts the list in the document of the editor', async () => {
      const { editor } = await typeInComment('@al')

      const list = await screen.findByRole('listbox')

      expect(list.ownerDocument).toBe(editor.ownerDocument)
    })
  })

  describe('mentions typed by hand', () => {
    it('are stored as the plain @<email> the backend reads', async () => {
      const { board, logo, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })
      const panel = await openLogo()
      const editor = await panel.findByRole('textbox', { name: 'Comment' })
      editor.focus()

      await typeRichText(editor, 'Hi @alice@example.com ')
      fireEvent.click(panel.getByRole('button', { name: 'Send' }))

      await waitFor(() => {
        expect(boardsApi.addComment).toHaveBeenCalledWith(
          board.id,
          logo.id,
          'Hi @alice@example.com'
        )
      })
    })
  })

  describe('mentions in a comment', () => {
    function commentWith(body: string) {
      const { board, logo, boardsApi } = logoBoard()
      boardsApi.comments.set(logo.id, [
        {
          id: 'c3',
          author: {
            userId: 'bob',
            email: 'bob@example.com',
            name: 'Bob Durand'
          },
          body,
          createdAt: '2026-10-05T09:00:00Z',
          reactions: []
        }
      ])
      renderRoute(`/boards/${board.id}`, { boardsApi })
      return openLogo().then(panel =>
        panel.findByRole('article', { name: 'Bob Durand' })
      )
    }

    it('shows a mention as the name of the member, with the email as its title', async () => {
      const comment = within(
        await commentWith('Thanks @alice@example.com, it is **done**.')
      )

      const mention = await comment.findByText('@Alice Martin')

      expect(mention).toHaveAttribute('title', 'alice@example.com')
      expect(comment.getByText('done').tagName).toBe('STRONG')
      expect(comment.queryByText(/alice@example.com/)).not.toBeInTheDocument()
    })

    it('shows a member whose email has an underscore', async () => {
      const comment = within(await commentWith('cc @jean_dupont@example.com'))

      expect(await comment.findByText('@Jean Dupont')).toHaveAttribute(
        'title',
        'jean_dupont@example.com'
      )
    })

    it('reads the email without caring about its case', async () => {
      const comment = within(await commentWith('@Albert@Example.com ok?'))

      expect(await comment.findByText('@Albert Roux')).toHaveAttribute(
        'title',
        'Albert@Example.com'
      )
    })

    it('keeps the email of someone who is not a member as it was typed', async () => {
      const article = await commentWith(
        'Ask @ghost@example.com or mail ghost@example.com'
      )

      await waitFor(() => {
        expect(article).toHaveTextContent(
          'Ask @ghost@example.com or mail ghost@example.com'
        )
      })
      expect(
        within(article).queryByTitle('ghost@example.com')
      ).not.toBeInTheDocument()
    })

    it('does not turn an address with an @ inside a word into a mention', async () => {
      const article = await commentWith('write to bob@alice@example.com')

      await waitFor(() => {
        expect(article).toHaveTextContent('write to bob@alice@example.com')
      })
      expect(
        within(article).queryByText('@Alice Martin')
      ).not.toBeInTheDocument()
    })
  })

  describe('emoji', () => {
    async function typeInComment(text: string) {
      const { board, logo, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })
      const panel = await openLogo()
      const editor = await panel.findByRole('textbox', { name: 'Comment' })
      editor.focus()
      await typeRichText(editor, text)
      return { board, logo, boardsApi, panel, editor }
    }

    it('suggests emoji as :name is typed and inserts the one chosen', async () => {
      const { board, logo, boardsApi, panel, editor } =
        await typeInComment('Great :thumb')

      // The names load in the background, after the first keystrokes of a test.
      const list = await waitFor(async () => {
        await typeRichText(editor, 'Great :thumbs')
        return screen.getByRole('listbox', { name: 'Emoji' })
      })
      fireEvent.click(within(list).getByRole('option', { name: 'thumbs up' }))

      await waitFor(() => {
        expect(editor.textContent).toBe('Great 👍️')
      })
      fireEvent.click(panel.getByRole('button', { name: 'Send' }))
      await waitFor(() => {
        expect(boardsApi.addComment).toHaveBeenCalledWith(
          board.id,
          logo.id,
          'Great 👍️'
        )
      })
    })

    it('suggests nothing for a smiley typed as text', async () => {
      await typeInComment('Done :)')

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).toBe(null)
      })
    })

    it('inserts the emoji picked from the button', async () => {
      const { panel, editor } = await typeInComment('Shipped ')

      fireEvent.click(panel.getByRole('button', { name: 'Emoji' }))
      fireEvent.change(await screen.findByLabelText('Search emoji'), {
        target: { value: 'party' }
      })
      fireEvent.click(
        within(screen.getByRole('group', { name: 'Emoji' })).getByRole(
          'button',
          { name: 'party popper' }
        )
      )

      await waitFor(() => {
        expect(editor).toHaveTextContent('Shipped 🎉')
      })
      await waitFor(() => {
        expect(screen.queryByLabelText('Search emoji')).toBe(null)
      })
    })

    it('inserts the first emoji found on Enter in the search', async () => {
      const { panel, editor } = await typeInComment('Shipped ')

      fireEvent.click(panel.getByRole('button', { name: 'Emoji' }))
      const search = await screen.findByLabelText('Search emoji')
      fireEvent.change(search, { target: { value: 'party popper' } })
      await screen.findByRole('button', { name: 'party popper' })
      fireEvent.keyDown(search, { key: 'Enter' })

      await waitFor(() => {
        expect(editor).toHaveTextContent('Shipped 🎉')
      })
    })
  })

  describe('reactions', () => {
    const bob = { userId: 'bob', email: 'bob@example.com', name: 'Bob Durand' }

    async function openReactions(
      reactions: { emoji: string; people: (typeof bob)[] }[],
      archived = false
    ) {
      const { board, logo, boardsApi } = logoBoard()
      board.archived = archived
      const [first] = boardsApi.comments.get(logo.id) ?? []
      if (first) first.reactions = reactions
      renderRoute(`/boards/${board.id}`, { boardsApi })
      const panel = await openLogo()
      const comment = within(
        await panel.findByRole('article', { name: 'Bob Durand' })
      )
      return { board, logo, boardsApi, panel, comment }
    }

    it('shows each emoji with who gave it, yours pressed', async () => {
      const { comment } = await openReactions([
        { emoji: '👍️', people: [bob, alice] },
        { emoji: '🎉', people: [bob] }
      ])

      const thumbs = comment.getByRole('button', {
        name: '👍️ from Bob Durand, Alice Martin'
      })
      expect(thumbs).toHaveTextContent('👍️ 2')
      expect(thumbs).toHaveAttribute('aria-pressed', 'true')
      expect(
        comment.getByRole('button', { name: '🎉 from Bob Durand' })
      ).toHaveAttribute('aria-pressed', 'false')
    })

    it('takes your reaction back when you press it again', async () => {
      const { board, logo, boardsApi, comment } = await openReactions([
        { emoji: '👍️', people: [bob, alice] }
      ])

      fireEvent.click(
        comment.getByRole('button', {
          name: '👍️ from Bob Durand, Alice Martin'
        })
      )

      expect(
        await comment.findByRole('button', { name: '👍️ from Bob Durand' })
      ).toHaveTextContent('👍️ 1')
      expect(boardsApi.removeReaction).toHaveBeenCalledWith(
        board.id,
        logo.id,
        'c1',
        '👍️'
      )
    })

    it('adds yours to an emoji someone else gave', async () => {
      const { board, logo, boardsApi, comment } = await openReactions([
        { emoji: '🎉', people: [bob] }
      ])

      fireEvent.click(
        comment.getByRole('button', { name: '🎉 from Bob Durand' })
      )

      expect(
        await comment.findByRole('button', {
          name: '🎉 from Bob Durand, Alice Martin'
        })
      ).toHaveAttribute('aria-pressed', 'true')
      expect(boardsApi.addReaction).toHaveBeenCalledWith(
        board.id,
        logo.id,
        'c1',
        '🎉'
      )
    })

    it('reacts from the usual reactions of the button over the comment', async () => {
      const { board, logo, boardsApi, panel, comment } = await openReactions([])

      fireEvent.click(panel.getByRole('button', { name: 'Add a reaction' }))
      const quick = await screen.findByRole('group', {
        name: 'Usual reactions'
      })
      expect(
        within(quick)
          .getAllByRole('button')
          .map(button => button.textContent)
      ).toEqual(['💜', '👍️', '👎️', '😂', '😮', '🥲', '🎉', ''])
      // Named by the emoji until the names load, then by its name.
      fireEvent.click(
        within(quick).getByRole('button', {
          name: /^(😂|face with tears of joy)$/
        })
      )

      expect(
        await comment.findByRole('button', { name: '😂 from Alice Martin' })
      ).toHaveTextContent('😂 1')
      expect(boardsApi.addReaction).toHaveBeenCalledWith(
        board.id,
        logo.id,
        'c1',
        '😂'
      )
    })

    it('throws confetti when you give 🎉, not when you take it back', async () => {
      vi.mocked(throwConfetti).mockClear()
      const { panel, comment } = await openReactions([])

      fireEvent.click(panel.getByRole('button', { name: 'Add a reaction' }))
      const quick = await screen.findByRole('group', {
        name: 'Usual reactions'
      })
      fireEvent.click(
        within(quick).getByRole('button', { name: /^(🎉|party popper)$/ })
      )
      const tada = await comment.findByRole('button', {
        name: '🎉 from Alice Martin'
      })
      expect(throwConfetti).toHaveBeenCalledTimes(1)

      fireEvent.click(tada)
      await waitFor(() => {
        expect(
          comment.queryByRole('button', { name: '🎉 from Alice Martin' })
        ).toBeNull()
      })
      expect(throwConfetti).toHaveBeenCalledTimes(1)
    })

    it('takes a usual reaction back when it is already yours', async () => {
      const { boardsApi, panel, comment } = await openReactions([
        { emoji: '👍️', people: [alice] }
      ])

      fireEvent.click(panel.getByRole('button', { name: 'Add a reaction' }))
      const quick = await screen.findByRole('group', {
        name: 'Usual reactions'
      })
      const thumbs = within(quick).getAllByRole('button')[1]
      if (!thumbs) throw new Error('No thumbs up in the usual reactions')
      expect(thumbs).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(thumbs)

      await waitFor(() => {
        expect(comment.queryByRole('group', { name: 'Reactions' })).toBe(null)
      })
      expect(boardsApi.removeReaction).toHaveBeenCalled()
    })

    it('reacts with any emoji from the grid behind the + button', async () => {
      const { board, logo, boardsApi, panel, comment } = await openReactions([])

      fireEvent.click(panel.getByRole('button', { name: 'Add a reaction' }))
      fireEvent.click(await screen.findByRole('button', { name: 'More emoji' }))
      const search = await screen.findByLabelText('Search emoji')
      // The names load in the background, after the first keystrokes of a test.
      const party = await waitFor(() => {
        fireEvent.change(search, { target: { value: 'party' } })
        return within(screen.getByRole('group', { name: 'Emoji' })).getByRole(
          'button',
          { name: 'party popper' }
        )
      })
      fireEvent.click(party)

      expect(
        await comment.findByRole('button', { name: '🎉 from Alice Martin' })
      ).toHaveTextContent('🎉 1')
      expect(boardsApi.addReaction).toHaveBeenCalledWith(
        board.id,
        logo.id,
        'c1',
        '🎉'
      )
    })

    it('shows the three most given and how many more, as Twake Chat does', async () => {
      const { comment } = await openReactions([
        { emoji: '😮', people: [bob] },
        { emoji: '👍️', people: [bob, alice] },
        { emoji: '🎉', people: [bob] },
        { emoji: '💜', people: [alice] },
        { emoji: '😂', people: [bob] }
      ])

      const group = within(comment.getByRole('group', { name: 'Reactions' }))
      expect(
        group
          .getAllByRole('button', { name: / from / })
          .map(chip => chip.textContent)
      ).toEqual(['👍️ 2', '😮 1', '🎉 1'])
      expect(group.getByText('+2')).toBeInTheDocument()
    })

    it('lists who gave every reaction', async () => {
      const { comment } = await openReactions([
        { emoji: '😮', people: [bob] },
        { emoji: '👍️', people: [bob, alice] },
        { emoji: '🎉', people: [bob] },
        { emoji: '💜', people: [alice] }
      ])

      fireEvent.click(comment.getByRole('button', { name: 'See who reacted' }))

      const list = await screen.findByRole('list', { name: 'See who reacted' })
      // Each reaction, then the people who gave it, each with an avatar.
      const names = (item: HTMLElement) =>
        within(item)
          .getAllByRole('listitem')
          .map(person => person.lastElementChild?.textContent)
      expect(
        Array.from(list.children, item => [
          item.firstElementChild?.textContent,
          names(item as HTMLElement)
        ])
      ).toEqual([
        ['👍️', ['Bob Durand', 'Alice Martin']],
        ['😮', ['Bob Durand']],
        ['🎉', ['Bob Durand']],
        ['💜', ['Alice Martin']]
      ])
    })

    it('lists who gave a reaction, with their avatars, on hover', async () => {
      const { comment } = await openReactions([
        { emoji: '👍️', people: [bob, alice] }
      ])

      fireEvent.mouseOver(comment.getByRole('button', { name: / from / }))

      const tooltip = within(await screen.findByRole('tooltip'))
      expect(
        tooltip.getAllByRole('listitem').map(person => person.textContent)
      ).toEqual(['BDBob Durand', 'AMAlice Martin'])
    })

    it('puts the reactions back as they were when saving fails', async () => {
      const { boardsApi, comment } = await openReactions([
        { emoji: '🎉', people: [bob] }
      ])
      boardsApi.addReaction.mockRejectedValueOnce(new Error('offline'))

      fireEvent.click(
        comment.getByRole('button', { name: '🎉 from Bob Durand' })
      )

      expect(
        await screen.findByText('The reaction could not be saved.')
      ).toBeInTheDocument()
      expect(
        comment.getByRole('button', { name: '🎉 from Bob Durand' })
      ).toHaveTextContent('🎉 1')
    })

    it('shows the reactions of an archived board without letting anyone react', async () => {
      const { comment } = await openReactions(
        [{ emoji: '🎉', people: [bob] }],
        true
      )

      expect(comment.getByLabelText('🎉 from Bob Durand')).toHaveTextContent(
        '🎉 1'
      )
      expect(
        comment.queryByRole('button', { name: '🎉 from Bob Durand' })
      ).toBe(null)
      expect(screen.queryByRole('button', { name: 'Add a reaction' })).toBe(
        null
      )
    })
  })
})
