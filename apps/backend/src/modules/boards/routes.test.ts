import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aB2cUser, aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

describe('user boards', () => {
  it('creates a board with the default sections', async () => {
    const alice = aUser()

    const response = await api
      .as(alice)
      .post('/boards', { name: 'Design', keyPrefix: 'DES' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      name: 'Design',
      keyPrefix: 'DES',
      role: 'admin',
      sections: [
        { name: 'To do', category: 'unstarted' },
        { name: 'In progress', category: 'started' },
        { name: 'Done', category: 'completed' }
      ]
    })
  })

  it.each([
    ['en', 'To do', 'In progress', 'Done'],
    ['fr', 'À faire', 'En cours', 'Terminé'],
    ['de', 'Zu erledigen', 'In Arbeit', 'Erledigt'],
    ['it', 'Da fare', 'In corso', 'Fatto'],
    ['es', 'Por hacer', 'En curso', 'Hecho'],
    ['ru', 'К выполнению', 'В работе', 'Готово'],
    ['vi', 'Cần làm', 'Đang làm', 'Hoàn thành'],
    ['fr-CA', 'À faire', 'En cours', 'Terminé'],
    ['klingon', 'To do', 'In progress', 'Done']
  ])(
    'names the default sections in the language %s',
    async (language, unstarted, started, completed) => {
      const response = await api
        .as(aUser())
        .post('/boards', { name: 'Design', keyPrefix: 'DES', language })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({
        sections: [
          { name: unstarted, category: 'unstarted' },
          { name: started, category: 'started' },
          { name: completed, category: 'completed' }
        ]
      })
    }
  )

  it('lists only the boards a person belongs to', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const carol = aB2cUser()
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    await api.as(bob).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    await api.as(carol).post('/boards', { name: 'Home', keyPrefix: 'HOME' })

    const boardNames = async (user: TestUser) =>
      (await api.as(user).get('/boards'))
        .json<{
          boards: { name: string }[]
        }>()
        .boards.map(board => board.name)

    expect(await boardNames(alice)).toEqual(['Inbox', 'Design'])
    expect(await boardNames(bob)).toEqual(['Inbox', 'Ops'])
    expect(await boardNames(carol)).toEqual(['Inbox', 'Home'])
  })

  it.each([aUser, aB2cUser])(
    'gives each user one Inbox on first use (%o)',
    async makeUser => {
      const alice = makeUser()

      const [first, second] = await Promise.all([
        api.as(alice).get('/boards'),
        api.as(alice).get('/boards')
      ])
      const inboxes = (
        response: typeof first
      ): { id: string; inbox: boolean }[] =>
        response
          .json<{ boards: { id: string; inbox: boolean }[] }>()
          .boards.filter(board => board.inbox)

      expect(inboxes(first)).toHaveLength(1)
      expect(inboxes(second)).toEqual(inboxes(first))
      const inbox = await api
        .as(alice)
        .get(`/boards/${String(inboxes(first)[0]?.id)}`)
      expect(inbox.json()).toMatchObject({
        name: 'Inbox',
        inbox: true,
        role: 'admin',
        sections: [],
        tasks: []
      })
    }
  )

  it('keeps a person’s boards apart in each organization', async () => {
    const b2c = aB2cUser()
    const inOrg = aUser({ userId: b2c.userId, email: b2c.email })
    await api.as(b2c).post('/boards', { name: 'Home', keyPrefix: 'HOME' })

    const created = await api
      .as(inOrg)
      .post('/boards', { name: 'Home office', keyPrefix: 'HOME' })
    const names = (await api.as(inOrg).get('/boards')).json<{
      boards: { name: string }[]
    }>()

    expect(created.statusCode).toBe(201)
    expect(names.boards.map(board => board.name)).toEqual([
      'Inbox',
      'Home office'
    ])
  })

  it.each([aUser, aB2cUser])(
    'keeps a person’s boards when their email changes (%o)',
    async makeUser => {
      const alice = makeUser()
      const renamed = { ...alice, email: `renamed-${alice.email}` }
      const reusedEmail = { ...aUser(alice), userId: aUser().userId }
      const created = (
        await api
          .as(alice)
          .post('/boards', { name: 'Design', keyPrefix: 'DES' })
      ).json<{ id: string }>()

      const own = await api.as(renamed).get(`/boards/${created.id}`)
      const other = await api.as(reusedEmail).get(`/boards/${created.id}`)

      expect(own.statusCode).toBe(200)
      expect(other.statusCode).toBe(404)
    }
  )

  it('opens a board for its members only', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const created = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()

    const own = await api.as(alice).get(`/boards/${created.id}`)
    const other = await api.as(bob).get(`/boards/${created.id}`)
    const outsider = await api.as(aB2cUser()).get(`/boards/${created.id}`)
    const malformed = await api.as(alice).get('/boards/not-a-uuid')

    expect(own.statusCode).toBe(200)
    expect(own.json()).toMatchObject({
      id: created.id,
      name: 'Design',
      role: 'admin',
      sections: [{ name: 'To do' }, { name: 'In progress' }, { name: 'Done' }],
      tasks: []
    })
    expect(other.statusCode).toBe(404)
    expect(outsider.statusCode).toBe(404)
    expect(malformed.statusCode).toBe(404)
  })

  it('refuses a key prefix another board of the organization uses, even one I cannot open', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { project } = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ project: { id: string } }>()

    const sameProject = await api.as(alice).post('/boards', {
      name: 'Desk',
      keyPrefix: 'DES',
      projectId: project.id
    })
    const otherProject = await api
      .as(alice)
      .post('/boards', { name: 'Desk', keyPrefix: 'DES' })
    const colleague = await api
      .as(bob)
      .post('/boards', { name: 'Desk', keyPrefix: 'DES' })
    const otherOrganization = await api
      .as(aUser())
      .post('/boards', { name: 'Desk', keyPrefix: 'DES' })

    for (const response of [sameProject, otherProject, colleague]) {
      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({ error: 'key_prefix_taken' })
    }
    expect(otherOrganization.statusCode).toBe(201)
  })

  it('lets B2C boards share a key prefix out of a project', async () => {
    const carol = aB2cUser()
    await api.as(carol).post('/boards', { name: 'Home', keyPrefix: 'HOME' })

    const again = await api
      .as(carol)
      .post('/boards', { name: 'Home office', keyPrefix: 'HOME' })
    const someoneElse = await api
      .as(aB2cUser())
      .post('/boards', { name: 'Home', keyPrefix: 'HOME' })

    expect(again.statusCode).toBe(201)
    expect(someoneElse.statusCode).toBe(201)
  })

  it('tells whether a key prefix is free in the organization, and proposes a free one', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const prefixFor = async (user: TestUser, keyPrefix: string) =>
      (await api.as(user).get(`/key-prefixes/${keyPrefix}`)).json<{
        available: boolean
        suggestion: string
      }>()
    for (const keyPrefix of ['DES', 'DES2', 'ABCDEFGHIJ']) {
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix })
    }

    expect(await prefixFor(bob, 'OPS')).toEqual({
      available: true,
      suggestion: 'OPS'
    })
    expect(await prefixFor(bob, 'DES')).toEqual({
      available: false,
      suggestion: 'DES3'
    })
    expect(await prefixFor(bob, 'ABCDEFGHIJ')).toEqual({
      available: false,
      suggestion: 'ABCDEFGHI2'
    })
    expect(await prefixFor(bob, 'INBOX')).toEqual({
      available: false,
      suggestion: 'INBOX2'
    })
    expect(await prefixFor(aUser(), 'DES')).toEqual({
      available: true,
      suggestion: 'DES'
    })
    expect(await prefixFor(aB2cUser(), 'DES')).toEqual({
      available: true,
      suggestion: 'DES'
    })
    expect(
      (await api.as(bob).get('/key-prefixes/not-a-prefix')).statusCode
    ).toBe(404)
  })

  it('keeps the INBOX key prefix for the Inbox', async () => {
    const response = await api
      .as(aUser())
      .post('/boards', { name: 'Mail', keyPrefix: 'INBOX' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'key_prefix_taken' })
  })

  it('refuses a NUL character, which Postgres cannot store', async () => {
    const alice = aUser()
    const board = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string; sections: { id: string }[] }>()
    const task = (
      await api
        .as(alice)
        .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
    ).json<{ id: string }>()
    const taskPath = `/boards/${board.id}/tasks/${task.id}`

    const responses = await Promise.all([
      api.as(alice).post(`/boards/${board.id}/tasks`, {
        sectionId: board.sections[0]?.id,
        title: 'nul\u{0}x'
      }),
      api.as(alice).patch(taskPath, { title: 'a\u{0}b' }),
      api.as(alice).post(`${taskPath}/comments`, { body: 'c\u{0}d' }),
      api
        .as(alice)
        .put(`${taskPath}/description`, { markdown: 'd\u{0}e', version: 0 }),
      api.as(alice).post(`/boards/${board.id}/sections`, {
        name: 'S\u{0}',
        category: 'backlog'
      }),
      api.as(alice).post(`/boards/${board.id}/labels`, { name: 'N\u{0}' }),
      api.as(alice).post('/filters', { name: 'f\u{0}', criteria: {} }),
      api.as(alice).get('/search?q=a%00')
    ])

    expect(responses.map(response => response.statusCode)).toEqual(
      responses.map(() => 400)
    )
    expect(responses[0].json()).toEqual({ error: 'invalid_request' })
  })
})
