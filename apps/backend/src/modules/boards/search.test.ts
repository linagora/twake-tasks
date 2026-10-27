import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aB2cUser, aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

const SPACE_ORIGIN = 'https://space.example.com'

beforeAll(async () => {
  api = await startApp({ searchAllowedOrigins: [SPACE_ORIGIN] })
})

afterAll(async () => {
  await api.close()
})

async function aBoardOf(owner: TestUser, keyPrefix: string) {
  const { id } = (
    await api.as(owner).post('/boards', { name: keyPrefix, keyPrefix })
  ).json<{ id: string }>()
  return {
    id,
    add: async (title: string, description?: string) => {
      const task = (
        await api
          .as(owner)
          .post(`/boards/${id}/tasks`, { sectionId: null, title })
      ).json<{ id: string }>()
      if (description) {
        await api.as(owner).put(`/boards/${id}/tasks/${task.id}/description`, {
          markdown: description,
          version: 0
        })
      }
      return task
    }
  }
}

const search = async (user: TestUser, q: string) =>
  (await api.as(user).get(`/search?${new URLSearchParams({ q }).toString()}`))
    .json<{ tasks: { key: string }[] }>()
    .tasks.map(task => task.key)

describe('search', () => {
  it('finds tasks by title, key or description', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const home = await aBoardOf(owner, 'HOM')
    await design.add('New logo')
    await design.add('Poster', 'Use the **new** palette')
    await home.add('Groceries')

    expect(await search(owner, 'NEW')).toEqual(['DES-1', 'DES-2'])
    expect(await search(owner, 'hom-1')).toEqual(['HOM-1'])
    expect(await search(owner, 'palette')).toEqual(['DES-2'])
    expect(await search(owner, '100%')).toEqual([])
  })

  it('names the project of each task found', async () => {
    const owner = aUser()
    const board = (
      await api.as(owner).post('/boards', { name: 'PRK', keyPrefix: 'PRK' })
    ).json<{ id: string; project: { id: string } }>()
    await api
      .as(owner)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Kickoff' })

    const found = (await api.as(owner).get('/search?q=kickoff')).json<{
      tasks: { projectId: string }[]
    }>().tasks

    expect(found.map(task => task.projectId)).toEqual([board.project.id])
  })

  it('lists the task whose key is the query first', async () => {
    const owner = aUser()
    const board = await aBoardOf(owner, 'SRK')
    await board.add('Undated')
    for (let n = 2; n <= 11; n++) {
      const task = await board.add(`Task ${String(n)}`)
      if (n >= 10) {
        await api.as(owner).patch(`/boards/${board.id}/tasks/${task.id}`, {
          dueDate: '2026-11-01'
        })
      }
    }

    expect(await search(owner, 'srk-1')).toEqual(['SRK-1', 'SRK-10', 'SRK-11'])
  })

  it('quotes the part of the description that matches, when the title does not', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    await design.add('Poster', 'Use the **new** palette')
    await design.add(
      'Brochure',
      `${'Intro sentence. '.repeat(10)}Print it on recycled paper for the spring fair. ${'Closing words. '.repeat(10)}`
    )
    await design.add('Palette swatches', 'Pick a palette')

    const found = (await api.as(owner).get('/search?q=palet')).json<{
      tasks: { key: string; excerpt: string | null }[]
    }>().tasks
    const recycled = (await api.as(owner).get('/search?q=RECYCLED')).json<{
      tasks: { key: string; excerpt: string | null }[]
    }>().tasks

    expect(found).toEqual([
      expect.objectContaining({ key: 'DES-1', excerpt: 'Use the new palette' }),
      expect.objectContaining({ key: 'DES-3', excerpt: null })
    ])
    expect(recycled).toEqual([
      expect.objectContaining({
        key: 'DES-2',
        excerpt:
          '…Intro sentence. Print it on recycled paper for the spring fair. Closing words. Closing…'
      })
    ])
  })

  it('tells which field each task answers by, and its text', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const ops = await aBoardOf(owner, 'OPS')
    await design.add('Poster', 'Print the poster on recycled paper')
    const moved = await design.add('Flyer')
    await api
      .as(owner)
      .post(`/boards/${design.id}/tasks/${moved.id}/transfer`, {
        boardId: ops.id,
        sectionId: null
      })
    const matches = async (q: string) =>
      (
        await api
          .as(owner)
          .get(`/search?${new URLSearchParams({ q }).toString()}`)
      )
        .json<{ tasks: { key: string; match: unknown }[] }>()
        .tasks.map(task => [task.key, task.match])

    expect(await matches('des-1')).toEqual([
      ['DES-1', { field: 'key', text: 'DES-1' }]
    ])
    expect(await matches('des-2')).toEqual([
      ['OPS-1', { field: 'previousKey', text: 'DES-2' }]
    ])
    expect(await matches('post')).toEqual([
      ['DES-1', { field: 'title', text: 'Poster' }]
    ])
    expect(await matches('recycled')).toEqual([
      [
        'DES-1',
        { field: 'description', text: 'Print the poster on recycled paper' }
      ]
    ])
  })

  it('finds tasks whatever the accents, and quotes them as written', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    await design.add('Préparer la fête')
    await design.add('Affiche', 'Imprimer sur papier recyclé')
    const found = async (q: string) =>
      (
        await api
          .as(owner)
          .get(`/search?${new URLSearchParams({ q }).toString()}`)
      )
        .json<{ tasks: { key: string; match: unknown }[] }>()
        .tasks.map(task => [task.key, task.match])

    expect(await found('preparer')).toEqual([
      ['DES-1', { field: 'title', text: 'Préparer la fête' }]
    ])
    expect(await found('FETE')).toEqual([
      ['DES-1', { field: 'title', text: 'Préparer la fête' }]
    ])
    expect(await found('recycle')).toEqual([
      ['DES-2', { field: 'description', text: 'Imprimer sur papier recyclé' }]
    ])
    expect(await found('affiché')).toEqual([
      ['DES-2', { field: 'title', text: 'Affiche' }]
    ])
  })

  it('only finds tasks on boards I can see', async () => {
    const owner = aUser()
    const stranger = aUser({ organizationId: owner.organizationId })
    const consumer = aB2cUser()
    const otherConsumer = aB2cUser()
    await (await aBoardOf(owner, 'SEC')).add('Secret plan')
    await (await aBoardOf(consumer, 'DIA')).add('Secret diary')

    expect(await search(stranger, 'secret')).toEqual([])
    expect(await search(otherConsumer, 'secret')).toEqual([])
    expect(await search(consumer, 'secret')).toEqual(['DIA-1'])
  })

  it('finds nothing for a query shorter than two characters', async () => {
    const owner = aUser()
    await (await aBoardOf(owner, 'ONE')).add('a')
    const responses = await Promise.all(
      ['', '%20', 'a', '%20a%20'].map(q => api.as(owner).get(`/search?q=${q}`))
    )

    expect(
      responses.map(response => [response.statusCode, response.json<unknown>()])
    ).toEqual(Array(4).fill([200, { tasks: [] }]))
  })

  it('refuses a missing or oversized query', async () => {
    const responses = await Promise.all(
      ['/search', `/search?q=${'a'.repeat(201)}`].map(url =>
        api.as(aUser()).get(url)
      )
    )

    expect(responses.map(response => response.statusCode)).toEqual([400, 400])
  })
})

describe('search from another app', () => {
  const searchOnly = (user: TestUser) => ({
    authorization: `Bearer ${api.tokenOf(user, { searchOnly: true })}`
  })

  it('takes a token good for search only on search, and nowhere else', async () => {
    const owner = aUser()
    await (await aBoardOf(owner, 'SPC')).add('Launch plan')
    const headers = searchOnly(owner)

    const found = await api.inject({
      method: 'GET',
      url: '/api/search?q=launch',
      headers
    })
    const boards = await api.inject({
      method: 'GET',
      url: '/api/boards',
      headers
    })
    const created = await api.inject({
      method: 'POST',
      url: '/api/boards',
      headers,
      payload: { name: 'Other', keyPrefix: 'OTH' }
    })

    expect(found.statusCode).toBe(200)
    expect(found.json<{ tasks: { key: string }[] }>().tasks).toEqual([
      expect.objectContaining({ key: 'SPC-1' })
    ])
    expect(boards.statusCode).toBe(401)
    expect(created.statusCode).toBe(401)
  })

  it('lets the allowed origin read the results, and only that one', async () => {
    const headers = searchOnly(aUser())
    const allowed = await api.inject({
      method: 'GET',
      url: '/api/search?q=x',
      headers: { ...headers, origin: SPACE_ORIGIN }
    })
    const unknown = await api.inject({
      method: 'GET',
      url: '/api/search?q=x',
      headers: { ...headers, origin: 'https://evil.example.com' }
    })

    expect(allowed.headers['access-control-allow-origin']).toBe(SPACE_ORIGIN)
    expect(allowed.headers['access-control-allow-credentials']).toBeUndefined()
    expect(allowed.headers.vary).toMatch(/origin/i)
    expect(unknown.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('lets the allowed origin read a refusal', async () => {
    const response = await api.inject({
      method: 'GET',
      url: '/api/search?q=x',
      headers: { origin: SPACE_ORIGIN }
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['access-control-allow-origin']).toBe(SPACE_ORIGIN)
  })

  it('answers the preflight of the allowed origin, and only that one', async () => {
    const preflight = (origin: string) =>
      api.inject({
        method: 'OPTIONS',
        url: '/api/search?q=x',
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization'
        }
      })

    const allowed = await preflight(SPACE_ORIGIN)
    const unknown = await preflight('https://evil.example.com')

    expect(allowed.statusCode).toBe(204)
    expect(allowed.headers).toMatchObject({
      'access-control-allow-origin': SPACE_ORIGIN,
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': 'Authorization'
    })
    expect(unknown.headers['access-control-allow-origin']).toBeUndefined()
    expect(unknown.headers['access-control-allow-methods']).toBeUndefined()
  })

  it('allows no origin on the other routes', async () => {
    const response = await api.inject({
      method: 'GET',
      url: '/api/boards',
      headers: {
        authorization: `Bearer ${api.tokenOf(aUser())}`,
        origin: SPACE_ORIGIN
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})
