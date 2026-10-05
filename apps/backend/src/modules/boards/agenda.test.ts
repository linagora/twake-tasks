import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { spaceMembers, spaces } from '../spaces/schema.ts'
import { shift, todayIn } from './recurrence.ts'
import { boards } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

const zone = 'Pacific/Kiritimati'
const today = todayIn(zone)

async function agenda(user: TestUser, days: number) {
  const response = await api
    .as(user)
    .get(`/agenda?zone=${encodeURIComponent(zone)}&days=${String(days)}`)
  return response.json<{
    today: string
    tasks: { key: string; boardName: string }[]
  }>()
}

async function aBoardOf(owner: TestUser, keyPrefix: string) {
  const board = (
    await api.as(owner).post('/boards', { name: keyPrefix, keyPrefix })
  ).json<{ id: string }>()
  const add = async (title: string, changes: object = {}) => {
    const task = (
      await api
        .as(owner)
        .post(`/boards/${board.id}/tasks`, { sectionId: null, title })
    ).json<{ id: string; key: string }>()
    if (Object.keys(changes).length > 0) {
      await api.as(owner).patch(`/boards/${board.id}/tasks/${task.id}`, changes)
    }
    return task
  }
  return { boardId: board.id, add }
}

describe('agenda', () => {
  it('lists overdue and due tasks across boards, soonest first', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const home = await aBoardOf(owner, 'HOM')
    await design.add('Later', { dueDate: shift(today, 1, 'days') })
    await home.add('Today, at nine', { dueDate: today, dueTime: '09:00' })
    await design.add('Today, urgent', { dueDate: today, priority: 1 })
    await home.add('Overdue', { dueDate: shift(today, -3, 'days') })
    await design.add('Someday')
    const done = await design.add('Done', { dueDate: today })
    await api
      .as(owner)
      .post(`/boards/${design.boardId}/tasks/${done.id}/complete`, {
        state: 'completed'
      })

    const todays = await agenda(owner, 1)

    expect(todays.today).toBe(today)
    expect(todays.tasks).toMatchObject([
      { key: 'HOM-2', boardName: 'HOM' },
      { key: 'HOM-1' },
      { key: 'DES-2' }
    ])
    expect((await agenda(owner, 2)).tasks.map(task => task.key)).toEqual([
      'HOM-2',
      'HOM-1',
      'DES-2',
      'DES-1'
    ])
  })

  it('keeps space tasks to the people they are assigned to', async () => {
    const alice = aUser()
    const carol = aUser({ organizationId: alice.organizationId })
    const spaceId = randomUUID()
    const boardId = await inTenant(db, alice, async tx => {
      await tx.insert(spaces).values({
        id: spaceId,
        organizationId: alice.organizationId ?? '',
        name: 'Marketing'
      })
      await tx.insert(spaceMembers).values(
        [alice, carol].map(user => ({
          spaceId,
          organizationId: alice.organizationId ?? '',
          userId: user.userId,
          email: user.email,
          role: 'editor' as const
        }))
      )
      const [board] = await tx
        .insert(boards)
        .values({
          organizationId: alice.organizationId,
          spaceId,
          name: 'Launch',
          keyPrefix: 'LCH',
          createdBy: alice.userId
        })
        .returning({ id: boards.id })
      return board?.id ?? ''
    })
    const add = async (title: string, assignee?: TestUser) => {
      const task = (
        await api
          .as(alice)
          .post(`/boards/${boardId}/tasks`, { sectionId: null, title })
      ).json<{ id: string }>()
      await api
        .as(alice)
        .patch(`/boards/${boardId}/tasks/${task.id}`, { dueDate: today })
      if (assignee) {
        await api
          .as(alice)
          .put(`/boards/${boardId}/tasks/${task.id}/assignees`, {
            userIds: [assignee.userId]
          })
      }
    }
    await add('Teaser', carol)
    await add('Nobody yet')

    expect((await agenda(carol, 1)).tasks).toMatchObject([{ key: 'LCH-1' }])
    expect((await agenda(alice, 1)).tasks).toEqual([])
  })

  it('refuses an unknown zone', async () => {
    const response = await api.as(aUser()).get('/agenda?zone=Mars/Base&days=1')

    expect(response.statusCode).toBe(400)
  })
})
