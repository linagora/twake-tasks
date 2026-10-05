import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ldapRestClient } from './ldapRest.ts'

const SECRET = 'a-secret-long-enough-for-ldap-rest-hmac'
const ORG = '/api/v1/organizations/acme'
const SPACE = '5c1e5b8e-5d3f-4e7a-9c55-111111111111'

const person = (n: number) => ({
  _id: `00000000-0000-4000-8000-00000000000${String(n)}`,
  mail: `user${String(n)}@acme.test`
})

const pageOf = <T>(items: T[]) => ({
  members: items,
  pagination: { totalPages: 1 }
})

function fakeLdapRest(routes: Record<string, unknown>) {
  const seen: string[] = []
  const fetch = (url: URL | string | Request, init?: RequestInit) => {
    const { pathname, search } = new URL(url instanceof Request ? url.url : url)
    const path = pathname + search
    const [, serviceId, timestamp, signature] =
      /^HMAC-SHA256 (.+):(\d+):([0-9a-f]+)$/.exec(
        new Headers(init?.headers).get('authorization') ?? ''
      ) ?? []
    const expected = createHmac('sha256', SECRET)
      .update(`GET|${path}|${timestamp ?? ''}|`)
      .digest('hex')
    if (serviceId !== 'twake-tasks' || signature !== expected) {
      return Promise.resolve(new Response(null, { status: 401 }))
    }
    seen.push(path)
    const body = routes[pathname]
    return Promise.resolve(
      body === undefined
        ? new Response(null, { status: 404 })
        : Response.json(body)
    )
  }
  return {
    seen,
    client: ldapRestClient({
      url: 'http://ldap-rest.test',
      serviceId: 'twake-tasks',
      secret: SECRET,
      fetch
    })
  }
}

describe('ldapRestClient', () => {
  it('gives members of linked groups the group role, unless they hold a stronger one', async () => {
    const { client } = fakeLdapRest({
      [`${ORG}/spaces/${SPACE}`]: {
        id: SPACE,
        name: 'Roadmap',
        groups: [{ id: 'designers', role: 'editor' }]
      },
      [`${ORG}/spaces/${SPACE}/members`]: pageOf([
        { ...person(1), role: 'admin' },
        { ...person(2), role: 'viewer' }
      ]),
      [`${ORG}/groups/designers/members`]: pageOf([person(1), person(3)])
    })

    expect(await client.space('acme', SPACE)).toEqual({
      id: SPACE,
      name: 'Roadmap',
      members: [
        { uuid: person(1)._id, email: person(1).mail, role: 'admin' },
        { uuid: person(2)._id, email: person(2).mail, role: 'viewer' },
        { uuid: person(3)._id, email: person(3).mail, role: 'editor' }
      ]
    })
  })

  it('answers null for a space that is gone', async () => {
    const { client } = fakeLdapRest({})

    expect(await client.space('acme', SPACE)).toBeNull()
  })

  it('reads every page of spaces', async () => {
    const { client, seen } = fakeLdapRest({
      [`${ORG}/spaces`]: {
        spaces: [{ id: SPACE, name: 'Roadmap', groups: [] }],
        pagination: { totalPages: 2 }
      }
    })

    expect(await client.spaceIds('acme')).toEqual([SPACE, SPACE])
    expect(seen).toEqual([
      `${ORG}/spaces?page=1&limit=100`,
      `${ORG}/spaces?page=2&limit=100`
    ])
  })

  it('skips deleted organizations, and refuses an empty list', async () => {
    const live = fakeLdapRest({
      '/api/v1/organizations': [
        { id: 'acme', status: 'active' },
        { id: 'old', status: 'deleted' }
      ]
    })
    expect(await live.client.organizations()).toEqual(['acme'])

    const failing = fakeLdapRest({ '/api/v1/organizations': [] })
    await expect(failing.client.organizations()).rejects.toThrow()
  })
})
