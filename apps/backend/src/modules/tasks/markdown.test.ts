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

  // CPU time, so that other test files running at once do not count.
  function millisecondsToRead(markdown: string) {
    const start = process.cpuUsage()
    plainText(markdown)
    const { user, system } = process.cpuUsage(start)
    return (user + system) / 1000
  }

  it.each([
    ['as deep as a comment allows', '>- - 1. '.repeat(1250)],
    ['as deep as a description allows', '>- - 1. '.repeat(6250)],
    [
      'after a line that looks like a fence',
      `\`\`\` a\`b\n${'>- - 1. '.repeat(1250)}`
    ]
  ])('reads containers nested %s quickly', (_, markdown) => {
    expect(millisecondsToRead(markdown)).toBeLessThan(200)
  })

  it.each([
    ['lists nested line after line', '- - a\n'.repeat(8000)],
    ['lists nested by indentation', '- a\n  - b\n'.repeat(5000)],
    ['emphasis nested', `${'*'.repeat(24999)}a${'*'.repeat(24999)}`],
    ['emphasis far apart', `${'*a '.repeat(8000)}${'b* '.repeat(8000)}`],
    [
      'emphasis far apart on lines',
      `${'*a\n'.repeat(8000)}${'b*\n'.repeat(8000)}`
    ]
  ])(
    'reads a description of %s in time linear in its length',
    (_, markdown) => {
      expect(millisecondsToRead(markdown)).toBeLessThan(3000)
    }
  )

  it('keeps the text of containers nested too deep', () => {
    expect(plainText(`${'- '.repeat(40)}a`)).toBe(`${'- '.repeat(8)}a`)
  })

  it('reads a long paragraph and a long code block whole', () => {
    const code = Array.from({ length: 600 }, () => '*a*').join('\n\n')
    expect(plainText(`${'line\n'.repeat(1000)}\n\`\`\`\n${code}\n\`\`\``)).toBe(
      `${'line\n'.repeat(1000)}${code}`
    )
  })

  it('keeps emphasis nested too deep as text', () => {
    const markdown = `${'*'.repeat(8000)}a${'*'.repeat(8000)}`
    expect(plainText(markdown)).toBe(markdown)
  })

  it.each([
    ['<pre>', '</pre>'],
    ['<!--', '-->'],
    ['<?', '?>'],
    ['<!DOCTYPE', '>'],
    ['<![CDATA[', ']]>']
  ])('reads a long %s block holding blank lines whole', (start, end) => {
    const html = `${start}\n${'x\n'.repeat(600)}\n*a*\n\n\`\`\`\n\n\`\`\`\n${end}`
    expect(plainText(`${html}\n\nafter`)).toBe(`${html}\nafter`)
  })

  it('cuts at blank lines after an HTML block closed on its line', () => {
    const paragraph = `*${'a\n'.repeat(300)}a*\n\n`
    const markdown = `${'p\n'.repeat(600)}<?>\n\n${paragraph.repeat(3)}`
    expect(plainText(markdown)).not.toContain('*')
  })

  it('reads a long list item with indented paragraphs whole', () => {
    const markdown = `10. a\n${'    b\n'.repeat(200)}\n    *c*\n`
    expect(plainText(markdown)).toBe(`a\n${'b\n'.repeat(200)}c`)
  })

  it('reads a long tilde fence holding a backtick fence whole', () => {
    const code = `${'x\n'.repeat(500)}\`\`\`\n${'*a*\n'.repeat(500)}`
    expect(plainText(`~~~\n${code}~~~`)).toBe(code.slice(0, -1))
  })

  it('reads a long fence in a list item whole', () => {
    const markdown = `- \`\`\`\n${'  x\n'.repeat(300)}\n  *a*\n  \`\`\`\n`
    expect(plainText(markdown)).toBe(`${'x\n'.repeat(300)}\n*a*`)
  })

  it('reads a long fence in a list in a quote whole', () => {
    const markdown = `> - ~~~\n${'>   *x*\n'.repeat(600)}>\n>   *a*\n>   ~~~\n`
    expect(plainText(markdown)).toBe(`${'*x*\n'.repeat(600)}\n*a*`)
  })

  it('reads a long fence indented in a nested list item whole', () => {
    const markdown = `1. a\n   - b\n\n     \`\`\`\n${'     x\n'.repeat(600)}\n     *a*\n     \`\`\`\n`
    expect(plainText(markdown)).toBe(`a\nb\n${'x\n'.repeat(600)}\n*a*`)
  })

  it('takes a backtick line with a backtick in its info string for text', () => {
    const markdown = `\`\`\` a\`b\n~~~\n${'x\n'.repeat(600)}\`\`\`\n\n*a*\n~~~\n`
    expect(plainText(markdown)).toBe(
      `\`\`\` a\`b\n${'x\n'.repeat(600)}\`\`\`\n\n*a*`
    )
  })

  it('reads a long fence on a later item of a numbered list whole', () => {
    const markdown = `1. a\n2. \`\`\`\n${'   x\n'.repeat(300)}\n${'   *a*\n'.repeat(300)}   \`\`\`\n`
    expect(plainText(markdown)).toBe(
      `a\n${'x\n'.repeat(300)}\n${'*a*\n'.repeat(300)}`.trimEnd()
    )
  })

  it('reads a long fence after an empty quote line whole', () => {
    const markdown = `> a\n>\n2. \`\`\`\n${'   x\n'.repeat(300)}\n${'   *a*\n'.repeat(300)}   \`\`\`\n`
    expect(plainText(markdown)).toBe(
      `a\n${'x\n'.repeat(300)}\n${'*a*\n'.repeat(300)}`.trimEnd()
    )
  })

  it('reads a long fence in a list nested 4 spaces deep whole', () => {
    const markdown = `1. a\n    - \`\`\`\n${'      *x*\n'.repeat(600)}      \`\`\`\n`
    expect(plainText(markdown)).toBe(`a\n${'*x*\n'.repeat(600)}`.trimEnd())
  })

  it('reads a long fence indented by a tab whole', () => {
    const markdown = `- a\n\n\t\`\`\`\n${'\tx\n'.repeat(300)}\n${'\t*a*\n'.repeat(300)}\t\`\`\`\n`
    expect(plainText(markdown)).toBe(
      `a\n${'x\n'.repeat(300)}\n${'*a*\n'.repeat(300)}`.trimEnd()
    )
  })

  it('ends a fence with the list item holding it', () => {
    const markdown = `- \`\`\`\n  x\n${'*a*\n\n'.repeat(600)}`
    expect(plainText(markdown)).toBe(`x\n${'a\n'.repeat(600)}`.trimEnd())
  })
})
