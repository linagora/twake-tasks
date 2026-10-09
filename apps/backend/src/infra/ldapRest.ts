import { createHmac } from 'node:crypto'
import { z } from 'zod'

const role = z.enum(['viewer', 'editor', 'admin'])
export type Role = z.infer<typeof role>

const page = z.object({
  pagination: z.object({ totalPages: z.number().int() })
})

const space = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  groups: z.array(z.object({ id: z.string().min(1), role }))
})

const spacesPage = page.extend({ spaces: z.array(space) })

const person = z.object({ _id: z.uuid(), mail: z.email() })
const membersPage = page.extend({ members: z.array(person.extend({ role })) })
const groupMembersPage = page.extend({ members: z.array(person) })

const organizations = z.array(
  z.object({ id: z.string().min(1), status: z.string().optional() })
)

export interface RemoteSpace {
  id: string
  name: string
  members: { uuid: string; email: string; role: Role }[]
}

export interface LdapRest {
  organizations(): Promise<string[]>
  spaceIds(organizationId: string): Promise<string[]>
  /** Null when the space is gone. */
  space(organizationId: string, spaceId: string): Promise<RemoteSpace | null>
}

const STRENGTH: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 }
const PAGE_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000

export function ldapRestClient(deps: {
  url: string
  serviceId: string
  secret: string
  fetch?: typeof fetch
}): LdapRest {
  const send = deps.fetch ?? fetch

  async function get(path: string): Promise<unknown> {
    const timestamp = String(Date.now())
    // A GET is signed with an empty body hash
    const signature = createHmac('sha256', deps.secret)
      .update(`GET|${path}|${timestamp}|`)
      .digest('hex')
    // The reconcile job calls this inside the scheduler's transaction, which a
    // hung ldap-rest would hold open along with every job queued behind it.
    const response = await send(new URL(path, deps.url), {
      headers: {
        authorization: `HMAC-SHA256 ${deps.serviceId}:${timestamp}:${signature}`
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(
        `ldap-rest answered ${String(response.status)} to ${path}`
      )
    }
    return response.json()
  }

  async function* pages<T extends z.infer<typeof page>>(
    path: string,
    schema: z.ZodType<T>
  ): AsyncGenerator<T> {
    for (let number = 1; ; number++) {
      const body = await get(
        `${path}?page=${String(number)}&limit=${String(PAGE_SIZE)}`
      )
      if (body === null) return
      const parsed = schema.parse(body)
      yield parsed
      if (number >= parsed.pagination.totalPages) return
    }
  }

  const org = (id: string) => `/api/v1/organizations/${encodeURIComponent(id)}`

  return {
    async organizations() {
      const all = organizations.parse(await get('/api/v1/organizations'))
      // ldap-rest answers an empty list when its directory fails
      if (all.length === 0) throw new Error('ldap-rest listed no organization')
      return all.filter(o => o.status !== 'deleted').map(o => o.id)
    },

    async spaceIds(organizationId) {
      const ids: string[] = []
      for await (const p of pages(
        `${org(organizationId)}/spaces`,
        spacesPage
      )) {
        ids.push(...p.spaces.map(s => s.id))
      }
      return ids
    },

    // The members route lists direct members only; a linked group's members
    // hold the group's role, and a person keeps their strongest role.
    async space(organizationId, spaceId) {
      const base = `${org(organizationId)}/spaces/${encodeURIComponent(spaceId)}`
      const found = await get(base)
      if (found === null) return null
      const { name, groups } = space.parse(found)
      const members = new Map<string, RemoteSpace['members'][number]>()
      const add = (uuid: string, email: string, role: Role) => {
        const known = members.get(uuid)
        if (!known || STRENGTH[role] > STRENGTH[known.role]) {
          members.set(uuid, { uuid, email, role })
        }
      }
      for await (const p of pages(`${base}/members`, membersPage)) {
        for (const m of p.members) add(m._id, m.mail, m.role)
      }
      for (const group of groups) {
        const path = `${org(organizationId)}/groups/${encodeURIComponent(group.id)}/members`
        for await (const p of pages(path, groupMembersPage)) {
          for (const m of p.members) add(m._id, m.mail, group.role)
        }
      }
      return { id: spaceId, name, members: [...members.values()] }
    }
  }
}
