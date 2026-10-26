import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { publishedEvent } from './published.ts'

describe('published events', () => {
  it('are each documented', async () => {
    const doc = await readFile(
      new URL('../../../../docs/events.md', import.meta.url),
      'utf8'
    )

    const missing = publishedEvent.options
      .map(option => option.shape.type.value)
      .filter(type => !doc.includes(`\`${type}\``))

    expect(missing).toEqual([])
  })
})
