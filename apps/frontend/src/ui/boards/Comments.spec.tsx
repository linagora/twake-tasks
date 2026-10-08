import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { typeRichText } from '@/testing/richText'

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
      createdAt: '2026-10-05T09:00:00Z'
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
        createdAt: '2026-10-05T09:00:00Z'
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
        expect(editor).toHaveTextContent('Thanks @alice@example.com')
      })
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
        expect(editor.textContent).toBe('@alice@example.com ')
      })
      expect(editor.querySelectorAll('a')).toHaveLength(0)
    })

    it('moves with the arrows and picks with Enter without sending', async () => {
      const { boardsApi, editor } = await typeInComment('@al')
      const list = await screen.findByRole('listbox')
      const options = within(list).getAllByRole('option')
      expect(options.slice(0, 2).map(option => option.textContent)).toEqual([
        expect.stringContaining('Alice Martin'),
        expect.stringContaining('Albert Roux')
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
        expect(editor.textContent).toBe('@albert@example.com ')
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
        expect(editor.textContent).toBe('@jean_dupont@example.com ')
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
        expect(editor.textContent).toBe('@albert@example.com ')
      })
    })

    it('picks instead of sending on Ctrl+Enter while the list is open', async () => {
      const { boardsApi, editor } = await typeInComment('@alb')
      await screen.findByRole('listbox')

      fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

      await waitFor(() => {
        expect(editor.textContent).toBe('@albert@example.com ')
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
      expect(editor).toHaveAttribute('aria-expanded', 'false')
    })

    it('does not suggest inside an email address', async () => {
      await typeInComment('write to bob@ali')

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('announces the suggestions to a screen reader', async () => {
      const { editor } = await typeInComment('Hi')
      expect(editor).toHaveAttribute('aria-haspopup', 'listbox')
      expect(editor).toHaveAttribute('aria-autocomplete', 'list')
      expect(editor).toHaveAttribute('aria-expanded', 'false')
      expect(editor).not.toHaveAttribute('aria-controls')

      await typeRichText(editor, 'Hi @al')

      const list = await screen.findByRole('listbox')
      const [first, second] = within(list).getAllByRole('option')
      expect(editor).toHaveAttribute('aria-expanded', 'true')
      expect(editor).toHaveAttribute('aria-controls', list.id)
      expect(editor).toHaveAttribute('aria-activedescendant', first?.id)
      fireEvent.keyDown(editor, { key: 'ArrowDown' })
      expect(editor).toHaveAttribute('aria-activedescendant', second?.id)
      fireEvent.keyDown(editor, { key: 'Escape' })
      await waitFor(() => {
        expect(editor).toHaveAttribute('aria-expanded', 'false')
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
          createdAt: '2026-10-05T09:00:00Z'
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
})
