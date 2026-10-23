import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

interface Label {
  id: string
  name: string
  color: string | null
}

interface Board {
  id: string
  version: number
  labels: Label[]
  tasks: { id: string; labels: Label[] }[]
}

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function on(user: TestUser, boardId: string) {
  const as = api.as(user)
  return {
    load: async () => (await as.get(`/boards/${boardId}`)).json<Board>(),
    addLabel: (name: string, color?: string | null) =>
      as.post(`/boards/${boardId}/labels`, { name, color }),
    editLabel: (labelId: string, changes: object) =>
      as.patch(`/boards/${boardId}/labels/${labelId}`, changes),
    addTask: async () =>
      (
        await as.post(`/boards/${boardId}/tasks`, {
          sectionId: null,
          title: 'Logo'
        })
      ).json<{ id: string }>(),
    label: (taskId: string, labelIds: string[]) =>
      as.put(`/boards/${boardId}/tasks/${taskId}/labels`, { labelIds })
  }
}

async function aBoard(user: TestUser, keyPrefix = 'DES', projectId?: string) {
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix, projectId })
  ).json<{ id: string; project: { id: string } }>()
  return { ...on(user, board.id), projectId: board.project.id }
}

describe('labels', () => {
  it('puts a new label on a task', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const task = await board.addTask()

    const created = await board.addLabel('Urgent')
    const label = created.json<Label>()
    const labeled = await board.label(task.id, [label.id])

    expect(created.statusCode).toBe(201)
    expect(labeled.statusCode).toBe(204)
    const loaded = await board.load()
    const urgent = { id: label.id, name: 'Urgent', color: null }
    expect(loaded.labels).toEqual([urgent])
    expect(loaded.tasks[0]?.labels).toEqual([urgent])
  })

  it('keeps the colour picked for a new label', async () => {
    const alice = aUser()
    const board = await aBoard(alice)

    const created = await board.addLabel('Urgent', '#e0465c')

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ name: 'Urgent', color: '#E0465C' })
    expect((await board.load()).labels).toMatchObject([{ color: '#E0465C' }])
  })

  it('refuses a colour that is not #RRGGBB', async () => {
    const alice = aUser()
    const board = await aBoard(alice)

    expect((await board.addLabel('Urgent', 'red')).statusCode).toBe(400)
    expect((await board.addLabel('Urgent', '#E0465')).statusCode).toBe(400)
  })

  it('renames and recolours a label', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const label = (await board.addLabel('Urgent')).json<Label>()

    const edited = await board.editLabel(label.id, {
      name: 'Blocker',
      color: '#273891'
    })

    expect(edited.statusCode).toBe(200)
    expect(edited.json()).toEqual({
      id: label.id,
      name: 'Blocker',
      color: '#273891'
    })
    expect((await board.load()).labels).toEqual([edited.json()])
  })

  it('takes the colour off a label', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const label = (await board.addLabel('Urgent', '#273891')).json<Label>()

    const edited = await board.editLabel(label.id, { color: null })

    expect(edited.json()).toMatchObject({ name: 'Urgent', color: null })
  })

  it('refuses a rename to a name taken in any case', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    await board.addLabel('Urgent')
    const later = (await board.addLabel('Later')).json<Label>()

    const renamed = await board.editLabel(later.id, { name: 'URGENT' })

    expect(renamed.statusCode).toBe(409)
    expect(renamed.json()).toEqual({ error: 'label_taken' })
  })

  it('keeps the labels of other projects out of reach', async () => {
    const alice = aUser()
    const design = await aBoard(alice, 'DES')
    const elsewhere = await aBoard(alice, 'ELS')
    const label = (await design.addLabel('Urgent')).json<Label>()

    const edited = await elsewhere.editLabel(label.id, { name: 'Mine' })

    expect(edited.statusCode).toBe(404)
    expect((await design.load()).labels).toEqual([label])
  })

  it('brings every board of the project up to date with an edit', async () => {
    const alice = aUser()
    const design = await aBoard(alice, 'DES')
    const ops = await aBoard(alice, 'OPS', design.projectId)
    const label = (await design.addLabel('Urgent')).json<Label>()
    const before = (await ops.load()).version

    await design.editLabel(label.id, { color: '#273891' })

    expect((await ops.load()).version).toBeGreaterThan(before)
  })

  it("shares a project's labels across its boards, not with other projects", async () => {
    const alice = aUser()
    const design = await aBoard(alice, 'DES')
    const ops = await aBoard(alice, 'OPS', design.projectId)
    const elsewhere = await aBoard(alice, 'ELS')

    const label = (await design.addLabel('Urgent')).json<Label>()
    const task = await ops.addTask()

    expect((await ops.label(task.id, [label.id])).statusCode).toBe(204)
    expect((await ops.load()).labels).toEqual([label])
    expect((await elsewhere.load()).labels).toEqual([])
    const other = await elsewhere.addTask()
    const refused = await elsewhere.label(other.id, [label.id])
    expect(refused.statusCode).toBe(400)
    expect(refused.json()).toEqual({ error: 'invalid_label' })
  })

  it('refuses a name already used in the scope', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    await board.addLabel('Urgent')

    const again = await board.addLabel('Urgent')

    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'label_taken' })
  })

  it('refuses a name that differs only by case', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    await board.addLabel('Urgent')

    const again = await board.addLabel('URGENT')

    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'label_taken' })
  })

  it.each([
    ['a zero width space', 'Urgent\u{200B}'],
    ['a word joiner', 'Ur\u{2060}gent'],
    ['decomposed accents', 'Cafe\u{301}'],
    ['full width letters', 'Ｕｒｇｅｎｔ'],
    ['a ligature', '\u{FB01}x']
  ])('refuses a name that differs only by %s', async (_, lookalike) => {
    const alice = aUser()
    const board = await aBoard(alice)
    await board.addLabel('Urgent')
    await board.addLabel('Café')
    await board.addLabel('fix')

    const again = await board.addLabel(lookalike)

    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'label_taken' })
  })

  it('stores a name without its invisible characters', async () => {
    const alice = aUser()
    const board = await aBoard(alice)

    const label = await board.addLabel('\u{200B}Cafe\u{301}\u{2060}')

    expect(label.json()).toMatchObject({ name: 'Café' })
  })

  it('stores a name with its compatibility forms folded', async () => {
    const alice = aUser()
    const board = await aBoard(alice)

    const label = await board.addLabel('Ｕｒｇｅｎｔ \u{FB01}x')

    expect(label.json()).toMatchObject({ name: 'Urgent fix' })
  })

  it.each([
    ['an emoji sequence', '\u{1F469}\u{200D}\u{1F4BB}'],
    [
      'a flag with tags',
      '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'
    ],
    ['a Persian non-joiner', 'می\u{200C}روم'],
    ['a Devanagari joiner', 'क्\u{200D}ष']
  ])('keeps the joiners of %s', async (_, name) => {
    const alice = aUser()
    const board = await aBoard(alice)

    const label = await board.addLabel(name)

    expect(label.json()).toMatchObject({ name })
  })

  it('keeps viewers from labeling', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    const task = await board.addTask()
    const label = (await board.addLabel('Urgent')).json<Label>()
    const { id: boardId } = await board.load()
    await joinBoard(db, alice, boardId, bob, 'viewer')
    const asBob = on(bob, boardId)

    expect((await asBob.addLabel('Later')).statusCode).toBe(403)
    expect(
      (await asBob.editLabel(label.id, { name: 'Later' })).statusCode
    ).toBe(403)
    expect((await asBob.label(task.id, [label.id])).statusCode).toBe(403)
    expect((await asBob.load()).labels).toEqual([label])
  })
})
