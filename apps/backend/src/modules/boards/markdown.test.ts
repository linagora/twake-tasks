import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mentionedEmails, plainText } from './markdown.ts'

// The frontend's RichText.spec.tsx reads the same cases.
const SHARED_CASES = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../packages/api-contract/fixtures/markdown.json',
      import.meta.url
    ),
    'utf8'
  )
) as { name: string; markdown: string; mentions: string[]; text: string }[]

describe.each(SHARED_CASES)('$name', ({ markdown, mentions, text }) => {
  it('notifies the people the app shows as mentioned', () => {
    expect([...mentionedEmails(markdown)].sort()).toEqual(mentions.toSorted())
  })

  it('reads the text the app shows', () => {
    expect(plainText(markdown)).toBe(text)
  })
})

describe('plainText', () => {
  it('puts each block of nested containers on its own line', () => {
    expect(plainText('> quote\n>\n> - one\n>   1. two\n\nend')).toBe(
      'quote\none\ntwo\nend'
    )
  })

  // Parsing Markdown nested this deep takes seconds, more in a parallel run.
  it(
    'copes with containers nested as deep as a comment allows',
    { timeout: 30_000 },
    () => {
      expect(() => plainText('>- - 1. '.repeat(1250))).not.toThrow()
    }
  )

  it(
    'copes with emphasis nested as deep as a description allows',
    { timeout: 30_000 },
    () => {
      expect(plainText(`${'*'.repeat(8000)}a${'*'.repeat(8000)}`)).toBe('a')
    }
  )
})
