import { describe, expect, it } from 'vitest'
import { plainText } from './markdown.ts'

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
