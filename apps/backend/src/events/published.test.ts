import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { publishedEvent, strictPublishedEvent } from './published.ts'

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

  it('relay a field added since, which the tests refuse', () => {
    const event = {
      specversion: '1.0',
      id: 'evt-1',
      source: 'twake://tasks',
      type: 'com.twake.tasks.space.provisioned.v1',
      data: {
        space_id: 'space-1',
        resource: { kind: 'project', id: 'project-1', name: 'Ops' }
      }
    }

    expect(publishedEvent.safeParse(event).success).toBe(true)
    expect(strictPublishedEvent.safeParse(event).success).toBe(false)
  })
})
