import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

interface Person {
  userId: string
  email: string
  name: string | null
}

describe('names', () => {
  it('names the people of a board once they have signed in', async () => {
    const alice = aUser({ name: 'Alice Martin' })
    const bob = aUser({ organizationId: alice.organizationId, name: 'Bob' })
    const board = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string; sections: { id: string }[] }>()
    await joinBoard(db, alice, board.id, bob, 'editor')
    const task = (
      await api.as(alice).post(`/boards/${board.id}/tasks`, {
        sectionId: board.sections[0]?.id,
        title: 'Logo'
      })
    ).json<{ id: string }>()
    const path = `/boards/${board.id}/tasks/${task.id}`
    await api.as(alice).put(`${path}/assignees`, {
      userIds: [alice.userId, bob.userId]
    })
    await api.as(alice).post(`${path}/comments`, { body: 'Which palette?' })

    const before = (await api.as(alice).get(`/boards/${board.id}`)).json<{
      members: Person[]
    }>()
    expect(before.members).toContainEqual({
      userId: bob.userId,
      email: bob.email,
      name: null
    })

    await api.as(bob).get('/boards')
    const after = (await api.as(alice).get(`/boards/${board.id}`)).json<{
      members: Person[]
      tasks: { assignees: Person[] }[]
    }>()
    const sharing = (
      await api.as(alice).get(`/boards/${board.id}/sharing`)
    ).json<{ members: Person[] }>()
    const { comments } = (await api.as(alice).get(`${path}/comments`)).json<{
      comments: { author: Person }[]
    }>()
    const { entries } = (await api.as(alice).get(`${path}/history`)).json<{
      entries: { actor: Person }[]
    }>()

    const names = (people: Person[]) => people.map(person => person.name)
    expect(names(after.members).sort()).toEqual(['Alice Martin', 'Bob'])
    expect(names(after.tasks[0]?.assignees ?? []).sort()).toEqual([
      'Alice Martin',
      'Bob'
    ])
    expect(names(sharing.members).sort()).toEqual(['Alice Martin', 'Bob'])
    expect(comments[0]?.author.name).toBe('Alice Martin')
    expect(entries[0]?.actor.name).toBe('Alice Martin')
  })

  it('keeps the last name the person signed in with', async () => {
    const alice = aUser({ name: 'Alice Martin' })
    const board = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()

    await api.as({ ...alice, name: 'Alice Durand' }).get('/boards')
    await api.as({ ...alice, name: null }).get('/boards')

    const { members } = (await api.as(alice).get(`/boards/${board.id}`)).json<{
      members: Person[]
    }>()
    expect(members[0]?.name).toBe('Alice Durand')
  })
})
