import { act, fireEvent } from '@testing-library/react'

// ProseMirror reads typing from DOM mutations, which jsdom reports on a microtask.
export async function typeRichText(
  box: HTMLElement,
  text: string
): Promise<void> {
  const paragraph = box.querySelector('p')
  if (!paragraph) throw new Error('The editor has no paragraph to type in')
  paragraph.textContent = text
  fireEvent.input(box)
  await act(async () => {
    await Promise.resolve()
  })
}
