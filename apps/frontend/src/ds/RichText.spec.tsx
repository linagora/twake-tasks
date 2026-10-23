import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RichText, RichTextEditor } from '@/ds/RichText'
import { renderWithProviders } from '@/testing/renderWithProviders'

const LABELS = {
  toolbar: 'Formatting',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  code: 'Code',
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  taskList: 'Checklist',
  link: 'Link',
  linkUrl: 'URL',
  apply: 'Apply'
}

const TEXT = 'See @bob@example.com tomorrow'

describe('mentions in rich text', () => {
  it('leave every other text as written once a mention was shown', async () => {
    renderWithProviders(
      <>
        <div data-testid="comment">
          <RichText markdown={TEXT} mentions={{ 'bob@example.com': 'Bob' }} />
        </div>
        <div data-testid="plain">
          <RichText markdown={TEXT} />
        </div>
      </>
    )

    expect(await screen.findByText('@Bob')).toBeInTheDocument()
    expect(screen.getByTestId('comment')).toHaveTextContent('See @Bob tomorrow')
    expect(screen.getByTestId('plain')).toHaveTextContent(TEXT)
  })

  it('keep the mention of a description loaded after a comment', async () => {
    renderWithProviders(
      <>
        <RichText markdown={TEXT} mentions={{ 'bob@example.com': 'Bob' }} />
        <RichTextEditor
          label="Description"
          initial={TEXT}
          labels={LABELS}
          onChange={vi.fn()}
        />
      </>
    )

    expect(
      await screen.findByRole('textbox', { name: 'Description' })
    ).toHaveTextContent(TEXT)
  })

  it('reads a mention saved with an escaped underscore', async () => {
    renderWithProviders(
      <RichText
        markdown={'Ask @jean\\_dupont@example.com'}
        mentions={{ 'jean_dupont@example.com': 'Jean Dupont' }}
      />
    )

    expect(await screen.findByText('@Jean Dupont')).toHaveAttribute(
      'title',
      'jean_dupont@example.com'
    )
  })

  it('does not show raw HTML in the markdown as a mention', async () => {
    renderWithProviders(
      <div data-testid="comment">
        <RichText
          markdown={'Ask <span data-email="bob@example.com">@Bob</span> now'}
          mentions={{ 'bob@example.com': 'Bob' }}
        />
      </div>
    )

    const comment = await screen.findByTestId('comment')
    await screen.findByText(/Ask/)
    expect(comment.querySelector('.mention')).toBeNull()
  })
})

describe('links in rich text', () => {
  it('ignore the target, rel and class written in the markdown', async () => {
    renderWithProviders(
      <RichText
        markdown={
          '<a href="https://example.com" target="_top" rel="opener" class="mention">spec</a>'
        }
      />
    )

    const link = await screen.findByRole('link', { name: 'spec' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(link).not.toHaveAttribute('class')
  })
})

describe('link tool', () => {
  it('does not submit the form around the editor when applying a link', async () => {
    const submit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault()
    })
    renderWithProviders(
      <form onSubmit={submit}>
        <RichTextEditor
          label="Comment"
          initial="see site"
          labels={LABELS}
          onChange={vi.fn()}
        />
      </form>
    )

    await screen.findByRole('textbox', { name: 'Comment' })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://example.org' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(submit).not.toHaveBeenCalled()
  })

  it('inserts the address as a link when no text is selected', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <RichTextEditor
        label="Description"
        initial="Website"
        labels={LABELS}
        onChange={onChange}
      />
    )

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://example.com/flowers' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(
      await screen.findByRole('link', { name: 'https://example.com/flowers' })
    ).toHaveAttribute('href', 'https://example.com/flowers')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.stringContaining(
        '[https://example.com/flowers](https://example.com/flowers)'
      )
    )
  })

  it.each([
    ['example.org/x', 'https://example.org/x'],
    ['example.org:8080/x', 'https://example.org:8080/x'],
    ['bob@example.com', 'mailto:bob@example.com'],
    ['mailto:bob@example.com', 'mailto:bob@example.com'],
    ['/boards/1', '/boards/1'],
    ['#notes', '#notes']
  ])('links %s to %s', async (typed, href) => {
    renderWithProviders(
      <RichTextEditor
        label="Description"
        initial="Website"
        labels={LABELS}
        onChange={vi.fn()}
      />
    )

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'URL' }), {
      target: { value: typed }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(await screen.findByRole('link', { name: href })).toHaveAttribute(
      'href',
      href
    )
  })

  it('does not insert an address with a script protocol', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <RichTextEditor
        label="Description"
        initial="Website"
        labels={LABELS}
        onChange={onChange}
      />
    )

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'URL' }), {
      target: { value: 'javascript:alert(1)' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not send the comment on Ctrl+Enter in the link field', async () => {
    const onSubmit = vi.fn()
    renderWithProviders(
      <RichTextEditor
        label="Comment"
        initial="see site"
        labels={LABELS}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await screen.findByRole('textbox', { name: 'Comment' })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.keyDown(await screen.findByRole('textbox', { name: 'URL' }), {
      key: 'Enter',
      ctrlKey: true
    })

    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('link picker tool', () => {
  it('shows no button without a link picker', async () => {
    renderWithProviders(
      <RichTextEditor
        label="Description"
        initial="Files"
        labels={LABELS}
        onChange={vi.fn()}
      />
    )

    await screen.findByRole('textbox', { name: 'Description' })
    expect(screen.queryByRole('button', { name: 'Drive' })).toBeNull()
  })

  it('inserts each link picked as a markdown link named after the file', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <RichTextEditor
        label="Description"
        initial="Files"
        labels={LABELS}
        onChange={onChange}
        linkPicker={{
          label: 'Drive',
          pick: () =>
            Promise.resolve([
              { name: 'Plan.pdf', url: 'https://alice-drive.test/public/1' },
              { name: 'Specs', url: 'https://alice-drive.test/public/2' }
            ])
        }}
      />
    )

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: 'Drive' }))

    expect(
      await screen.findByRole('link', { name: 'Plan.pdf' })
    ).toHaveAttribute('href', 'https://alice-drive.test/public/1')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.stringContaining(
        '[Plan.pdf](https://alice-drive.test/public/1) [Specs](https://alice-drive.test/public/2)'
      )
    )
  })

  it('leaves the text alone when nothing is picked', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <RichTextEditor
        label="Description"
        initial="Files"
        labels={LABELS}
        onChange={onChange}
        linkPicker={{ label: 'Drive', pick: () => Promise.resolve([]) }}
      />
    )

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: 'Drive' }))
    await Promise.resolve()

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('checklists in rich text', () => {
  it('show the checkboxes of saved text as read-only', async () => {
    renderWithProviders(<RichText markdown="- [ ] check me" />)

    expect(await screen.findByRole('checkbox')).toBeDisabled()
  })

  it('nudge the checkbox by 2px, not by two spacing units', async () => {
    renderWithProviders(<RichText markdown="- [ ] check me" />)

    const label = (await screen.findByRole('checkbox')).closest('label')
    expect(label && getComputedStyle(label).marginTop).toBe('2px')
  })

  it('keep the checkboxes of the editor tickable', async () => {
    renderWithProviders(
      <RichTextEditor
        label="Description"
        initial="- [ ] check me"
        labels={LABELS}
        onChange={vi.fn()}
      />
    )

    expect(await screen.findByRole('checkbox')).toBeEnabled()
  })
})
