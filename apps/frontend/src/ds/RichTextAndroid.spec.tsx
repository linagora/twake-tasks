import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RichTextEditor } from '@/ds/RichText'
import { renderWithProviders } from '@/testing/renderWithProviders'

vi.hoisted(() => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value:
      'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'
  })
})

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

describe('Ctrl+Enter in the rich-text editor on Chrome for Android', () => {
  it('submits', async () => {
    const onSubmit = vi.fn()
    renderWithProviders(
      <RichTextEditor
        label="Comment"
        initial=""
        labels={LABELS}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.keyDown(await screen.findByRole('textbox', { name: 'Comment' }), {
      key: 'Enter',
      keyCode: 13,
      ctrlKey: true
    })

    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
