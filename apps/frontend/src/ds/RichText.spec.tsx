import { screen } from '@testing-library/react'
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
