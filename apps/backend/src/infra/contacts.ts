import type { Logger } from 'pino'
import { z } from 'zod'

export interface Contact {
  email: string
  name: string | null
}

export interface ContactSearch {
  /**
   * The contacts of `user` matching the query, one per lowercased email;
   * none when the search fails.
   */
  search(user: string, query: string): Promise<Contact[]>
}

// More than the dialog shows, as members and invites are left out after.
const LIMIT = 20
// The share dialog waits for it, and Tasks can suggest without it.
const TIMEOUT_MS = 1000

const results = z.array(
  z.object({
    names: z.array(z.object({ displayName: z.string() })).default([]),
    emailAddresses: z.array(z.object({ value: z.string() })).default([])
  })
)

const email = z.email()

/** The common contacts search of Twake Workplace (ADR 058). */
export function contactSearchClient(deps: {
  url: string
  secret: string
  logger: Logger
  fetch?: typeof fetch
}): ContactSearch {
  const send = deps.fetch ?? fetch
  const endpoint = new URL(`${deps.url.replace(/\/+$/, '')}/api/people/search`)
  return {
    async search(user, query) {
      try {
        const response = await send(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${deps.secret}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            user,
            q: query,
            objectTypes: ['contact'],
            hasFields: ['emailAddresses'],
            limit: LIMIT,
            offset: 0
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        if (!response.ok) {
          throw new Error(`contacts search answered ${String(response.status)}`)
        }
        const found = new Map<string, Contact>()
        for (const contact of results.parse(await response.json())) {
          const address = contact.emailAddresses[0]?.value.trim().toLowerCase()
          if (
            !address ||
            found.has(address) ||
            !email.safeParse(address).success
          ) {
            continue
          }
          found.set(address, {
            email: address,
            name: contact.names[0]?.displayName.trim() || null
          })
        }
        return [...found.values()]
      } catch (error) {
        deps.logger.warn({ err: error }, 'contacts search failed')
        return []
      }
    }
  }
}
