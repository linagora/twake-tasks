import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { contactSearchClient } from './contacts.ts'

const logger = pino({ level: 'silent' })

function clientAnswering(
  answer: (init: RequestInit) => Promise<Response>,
  url = 'http://contacts.test:81'
) {
  const seen: { url: URL | string | Request; init: RequestInit }[] = []
  const client = contactSearchClient({
    url,
    secret: 'tasks-secret',
    logger,
    fetch: (url, init = {}) => {
      seen.push({ url, init })
      return answer(init)
    }
  })
  return { client, seen }
}

describe('contactSearchClient', () => {
  it('searches on behalf of the user with the Tasks secret, and keeps the first email and name', async () => {
    const { client, seen } = clientAnswering(() =>
      Promise.resolve(
        Response.json([
          {
            id: '1',
            objectType: 'contact',
            names: [{ displayName: 'Ada Lovelace', type: 'default' }],
            emailAddresses: [
              { value: 'Ada@Example.com', type: 'Work' },
              { value: 'ada@home.test', type: 'Home' }
            ]
          },
          {
            id: '2',
            objectType: 'contact',
            names: [],
            emailAddresses: [{ value: 'grace@example.com' }]
          },
          { id: '3', objectType: 'contact', names: [], emailAddresses: [] },
          {
            id: '4',
            objectType: 'contact',
            emailAddresses: [{ value: 'not an address' }]
          }
        ])
      )
    )

    expect(await client.search('alice@example.com', 'ada')).toEqual([
      { email: 'ada@example.com', name: 'Ada Lovelace' },
      { email: 'grace@example.com', name: null }
    ])
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toEqual(
      new URL('http://contacts.test:81/api/people/search')
    )
    expect(new Headers(seen[0]?.init.headers).get('authorization')).toBe(
      'Bearer tasks-secret'
    )
    expect(JSON.parse(seen[0]?.init.body as string)).toEqual({
      user: 'alice@example.com',
      q: 'ada',
      objectTypes: ['contact'],
      hasFields: ['emailAddresses'],
      limit: 20,
      offset: 0
    })
  })

  it('finds no one when the service refuses, fails or is slow', async () => {
    const refusing = clientAnswering(() =>
      Promise.resolve(new Response(null, { status: 401 }))
    )
    const hanging = clientAnswering(
      init =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error)
          })
        })
    )

    expect(await refusing.client.search('alice@example.com', 'ada')).toEqual([])
    expect(await hanging.client.search('alice@example.com', 'ada')).toEqual([])
  })

  it('suggests an address held by several contacts once, under a path prefix', async () => {
    const { client, seen } = clientAnswering(
      () =>
        Promise.resolve(
          Response.json([
            {
              names: [{ displayName: 'Ada' }],
              emailAddresses: [{ value: 'ada@example.com' }]
            },
            {
              names: [{ displayName: 'Ada again' }],
              emailAddresses: [{ value: 'ADA@example.com' }]
            }
          ])
        ),
      'http://gateway.test/contacts/'
    )

    expect(await client.search('alice@example.com', 'ada')).toEqual([
      { email: 'ada@example.com', name: 'Ada' }
    ])
    expect(seen[0]?.url).toEqual(
      new URL('http://gateway.test/contacts/api/people/search')
    )
  })
})
