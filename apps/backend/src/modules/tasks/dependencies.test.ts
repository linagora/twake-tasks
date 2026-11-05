import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import {
  aB2cUser,
  aUser,
  joinBoard,
  startApp,
  type TestUser
} from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

interface Linked {
  taskId: string
  task: { key: string; boardName: string; done: boolean } | null
}

async function aBoard(owner: TestUser, keyPrefix: string) {
  const board = (
    await api
      .as(owner)
      .post('/boards', { name: `Board ${keyPrefix}`, keyPrefix })
  ).json<{ id: string }>().id
  const task = async (title: string) => {
    const id = (
      await api
        .as(owner)
        .post(`/boards/${board}/tasks`, { sectionId: null, title })
    ).json<{ id: string }>().id
    return { id, at: `/boards/${board}/tasks/${id}` }
  }
  return { id: board, task }
}

const linksOf = async (user: TestUser, at: string) =>
  (await api.as(user).get(`${at}/links`)).json<{
    blockedBy: Linked[]
    blocks: Linked[]
  }>()

const blockersOn = async (user: TestUser, boardId: string, taskId: string) =>
  (await api.as(user).get(`/boards/${boardId}`))
    .json<{
      tasks: { id: string; blockers: ({ key: string } | null)[] }[]
    }>()
    .tasks.find(task => task.id === taskId)?.blockers

describe('task dependencies', () => {
  it('shows a link from both sides until the blocker is done', async () => {
    const alice = aUser()
    const board = await aBoard(alice, 'FEA')
    const venue = await board.task('Book the venue')
    const release = await board.task('Send the press release')

    expect(
      (
        await api
          .as(alice)
          .post(`${release.at}/links`, { kind: 'blockedBy', taskId: venue.id })
      ).statusCode
    ).toBe(204)

    expect((await linksOf(alice, venue.at)).blocks).toMatchObject([
      { taskId: release.id, task: { key: 'FEA-2', done: false } }
    ])
    expect(await blockersOn(alice, board.id, release.id)).toEqual([
      { key: 'FEA-1', title: 'Book the venue' }
    ])

    await api.as(alice).post(`${venue.at}/complete`, { state: 'completed' })

    expect(await blockersOn(alice, board.id, release.id)).toEqual([])
    expect((await linksOf(alice, release.at)).blockedBy).toMatchObject([
      { task: { key: 'FEA-1', done: true } }
    ])
  })

  it('tells the blocked task’s assignee once its last blocker is done', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice, 'FEA')
    await joinBoard(db, alice, board.id, bob, 'editor')
    const venue = await board.task('Book the venue')
    const caterer = await board.task('Book the caterer')
    const release = await board.task('Send the press release')
    for (const blocker of [venue, caterer]) {
      await api
        .as(alice)
        .post(`${release.at}/links`, { kind: 'blockedBy', taskId: blocker.id })
    }
    await api
      .as(alice)
      .put(`${release.at}/assignees`, { userIds: [bob.userId] })
    const unblocked = async () =>
      (await api.as(bob).get('/notifications'))
        .json<{
          notifications: { change: { field: string; name: string } | null }[]
        }>()
        .notifications.filter(each => each.change?.field === 'unblocked')

    await api.as(alice).post(`${venue.at}/complete`, { state: 'completed' })
    expect(await unblocked()).toEqual([])

    await api.as(alice).post(`${caterer.at}/complete`, { state: 'canceled' })
    expect(await unblocked()).toMatchObject([
      { change: { field: 'unblocked', name: 'FEA-2' } }
    ])

    await api.as(alice).post(`${caterer.at}/complete`, { state: 'completed' })
    expect(await unblocked()).toHaveLength(1)
  })

  it('records adding and removing a link in the history of both tasks', async () => {
    const alice = aUser()
    const board = await aBoard(alice, 'FEA')
    const venue = await board.task('Book the venue')
    const release = await board.task('Send the press release')

    await api
      .as(alice)
      .post(`${venue.at}/links`, { kind: 'blocks', taskId: release.id })
    expect(
      (await api.as(alice).delete(`${release.at}/links/${venue.id}`)).statusCode
    ).toBe(204)

    const history = async (at: string) =>
      (await api.as(alice).get(`${at}/history`))
        .json<{ entries: { field: string; to: unknown; name: string }[] }>()
        .entries.filter(entry => entry.field !== 'created')
    expect(await history(release.at)).toMatchObject([
      { field: 'blockedBy', to: null, name: 'FEA-1' },
      { field: 'blockedBy', to: venue.id, name: 'FEA-1' }
    ])
    expect(await history(venue.at)).toMatchObject([
      { field: 'blocks', to: null, name: 'FEA-2' },
      { field: 'blocks', to: release.id, name: 'FEA-2' }
    ])
    expect(await linksOf(alice, venue.at)).toEqual({
      blockedBy: [],
      blocks: []
    })
  })

  it('refuses a link that makes a task block itself', async () => {
    const alice = aUser()
    const board = await aBoard(alice, 'FEA')
    const [first, second, third] = [
      await board.task('One'),
      await board.task('Two'),
      await board.task('Three')
    ]
    await api
      .as(alice)
      .post(`${second.at}/links`, { kind: 'blockedBy', taskId: first.id })
    await api
      .as(alice)
      .post(`${third.at}/links`, { kind: 'blockedBy', taskId: second.id })

    const cycle = await api
      .as(alice)
      .post(`${first.at}/links`, { kind: 'blockedBy', taskId: third.id })
    expect(cycle.statusCode).toBe(409)
    expect(cycle.json()).toMatchObject({ error: 'link_cycle' })
    expect(
      (
        await api
          .as(alice)
          .post(`${first.at}/links`, { kind: 'blocks', taskId: first.id })
      ).json()
    ).toMatchObject({ error: 'invalid_link' })
  })

  it('refuses a sub-task of the task', async () => {
    const alice = aUser()
    const board = await aBoard(alice, 'FEA')
    const parent = await board.task('Event')
    const child = (
      await api.as(alice).post(`/boards/${board.id}/tasks`, {
        parentId: parent.id,
        title: 'Venue'
      })
    ).json<{ id: string }>().id

    expect(
      (
        await api
          .as(alice)
          .post(`${parent.at}/links`, { kind: 'blockedBy', taskId: child })
      ).json()
    ).toMatchObject({ error: 'invalid_link' })
    expect(
      (
        await api.as(alice).post(`/boards/${board.id}/tasks/${child}/links`, {
          kind: 'blocks',
          taskId: parent.id
        })
      ).json()
    ).toMatchObject({ error: 'invalid_link' })
  })

  it('hides a task on a board the person cannot open', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const events = await aBoard(alice, 'FEA')
    const security = await aBoard(alice, 'SEC')
    await joinBoard(db, alice, events.id, bob, 'viewer')
    const review = await security.task('Security review')
    const deploy = await events.task('Deploy')
    await api
      .as(alice)
      .post(`${deploy.at}/links`, { kind: 'blockedBy', taskId: review.id })

    expect((await linksOf(alice, deploy.at)).blockedBy).toMatchObject([
      { task: { key: 'SEC-1', boardName: 'Board SEC' } }
    ])
    expect((await linksOf(bob, deploy.at)).blockedBy).toEqual([
      { taskId: review.id, task: null }
    ])
    expect(await blockersOn(bob, events.id, deploy.id)).toEqual([null])
  })

  it('lets a viewer see links but not change them', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice, 'FEA')
    await joinBoard(db, alice, board.id, bob, 'viewer')
    const venue = await board.task('Book the venue')
    const release = await board.task('Send the press release')

    expect(
      (
        await api
          .as(bob)
          .post(`${release.at}/links`, { kind: 'blockedBy', taskId: venue.id })
      ).statusCode
    ).toBe(403)
  })

  it('reaches no task of another organization', async () => {
    const alice = aUser()
    const mallory = aUser()
    const mine = await (await aBoard(alice, 'FEA')).task('Mine')
    const theirs = await (await aBoard(mallory, 'OTH')).task('Theirs')

    expect(
      (
        await api
          .as(alice)
          .post(`${mine.at}/links`, { kind: 'blockedBy', taskId: theirs.id })
      ).statusCode
    ).toBe(404)
  })

  it('keeps links between two tasks of one project without an organization', async () => {
    const alice = aB2cUser()
    const board = await aBoard(alice, 'FEA')
    const task = await board.task('Plan')
    const sameProject = await board.task('Book')
    const other = await (await aBoard(alice, 'OTH')).task('Other')

    expect(
      (
        await api
          .as(alice)
          .post(`${task.at}/links`, { kind: 'blockedBy', taskId: other.id })
      ).json()
    ).toMatchObject({ error: 'invalid_link' })
    expect(
      (
        await api.as(alice).post(`${task.at}/links`, {
          kind: 'blockedBy',
          taskId: sameProject.id
        })
      ).statusCode
    ).toBe(204)
  })

  it('hides an archived task’s links until it is restored', async () => {
    const alice = aUser()
    const board = await aBoard(alice, 'FEA')
    const venue = await board.task('Book the venue')
    const release = await board.task('Send the press release')
    await api
      .as(alice)
      .post(`${release.at}/links`, { kind: 'blockedBy', taskId: venue.id })

    await api.as(alice).post(`${venue.at}/archive`, {})
    expect((await linksOf(alice, release.at)).blockedBy).toEqual([])
    expect(await blockersOn(alice, board.id, release.id)).toEqual([])

    await api.as(alice).post(`${venue.at}/restore`, {})
    expect((await linksOf(alice, release.at)).blockedBy).toHaveLength(1)
  })
})
