// A stand-in for the calendar side service's common contacts search: the
// contacts of each person, behind the secret Tasks holds.
import { createServer, type ServerResponse } from 'node:http'

const SECRET = 'e2e-contacts-secret'

const CONTACTS: Record<string, { name: string; email: string }[]> = {
  'alice@acme.e2e.test': [
    { name: 'Bob Durand', email: 'bob@acme.e2e.test' },
    { name: 'Grace Hopper', email: 'grace@acme.e2e.test' }
  ]
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${SECRET}`) {
    json(res, 401, { error: 'unauthorized' })
    return
  }
  if (req.method !== 'POST' || req.url !== '/api/people/search') {
    json(res, 404, { error: 'not_found' })
    return
  }
  let body = ''
  req.on('data', (chunk: Buffer) => (body += chunk.toString()))
  req.on('end', () => {
    const { user, q, limit } = JSON.parse(body) as {
      user?: string
      q?: string
      limit?: number
    }
    if (!user?.includes('@') || !limit) {
      json(res, 400, { error: 'bad_request' })
      return
    }
    const query = (q ?? '').toLowerCase()
    json(
      res,
      200,
      (CONTACTS[user] ?? [])
        .filter(contact =>
          `${contact.name} ${contact.email}`.toLowerCase().includes(query)
        )
        .slice(0, limit)
        .map(contact => ({
          id: contact.email,
          objectType: 'contact',
          names: [{ displayName: contact.name, type: 'default' }],
          emailAddresses: [{ value: contact.email, type: 'Work' }]
        }))
    )
  })
})

server.listen(Number(process.env.PORT ?? 8081), () => {
  console.log('contacts search stand-in on 8081')
})
