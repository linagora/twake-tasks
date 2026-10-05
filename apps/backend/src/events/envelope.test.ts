import { describe, expect, it } from 'vitest'
import { parseCloudEvent, parsePlatformEvent } from './envelope.ts'

const calendarAccepted = {
  specversion: '1.0',
  id: '01J9Z6K4X8M2Q7R5T3V1W0Y9AB',
  source: 'twake://calendar',
  type: 'com.twake.calendar.event.accepted.v1',
  time: '2026-10-05T09:14:22Z',
  subject: 'event/7f3c2a',
  twakeorg: 'linagora',
  twakeactor: 'user1@linagora.com',
  data: {
    object: {
      type: 'event',
      id: '7f3c2a',
      space_id: '0f8e2c4a-6b1d-4e7a-9c3f-2d5b8a1e6f90'
    }
  }
}

describe('parseCloudEvent', () => {
  it('parses a structured mode CloudEvent and keeps extra fields', () => {
    const result = parseCloudEvent(
      Buffer.from(JSON.stringify(calendarAccepted))
    )

    expect(result).toEqual({ ok: true, event: calendarAccepted })
  })

  it('accepts a B2C event, without twakeorg nor space_id', () => {
    const event = {
      ...calendarAccepted,
      twakeorg: undefined,
      data: { object: { type: 'event', id: '7f3c2a' } }
    }

    expect(parseCloudEvent(JSON.stringify(event)).ok).toBe(true)
  })

  it.each([
    ['invalid JSON', '{'],
    ['an empty message', null],
    [
      'a wrong specversion',
      JSON.stringify({ ...calendarAccepted, specversion: '0.3' })
    ],
    ['a missing id', JSON.stringify({ ...calendarAccepted, id: undefined })],
    [
      'a twakeactor that is not an email',
      JSON.stringify({ ...calendarAccepted, twakeactor: 'user1' })
    ],
    [
      'data without an object',
      JSON.stringify({ ...calendarAccepted, data: {} })
    ],
    [
      'a space_id that is not a UUID',
      JSON.stringify({
        ...calendarAccepted,
        data: { object: { space_id: 'space-42' } }
      })
    ]
  ])('rejects %s', (_case, value) => {
    expect(parseCloudEvent(value).ok).toBe(false)
  })
})

describe('parsePlatformEvent', () => {
  const body = { groupId: 'g1', organizationId: 'linagora' }

  it('reads routing key and message id from the AMQP headers', () => {
    const result = parsePlatformEvent(Buffer.from(JSON.stringify(body)), {
      amqp_routing_key: Buffer.from('b2b.group.created'),
      amqp_message_id: Buffer.from('msg-1')
    })

    expect(result).toEqual({
      ok: true,
      event: { routingKey: 'b2b.group.created', messageId: 'msg-1', body }
    })
  })

  it('rejects a message without amqp_message_id', () => {
    const result = parsePlatformEvent(JSON.stringify(body), {
      amqp_routing_key: 'b2b.group.created'
    })

    expect(result.ok).toBe(false)
  })
})
