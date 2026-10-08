import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { jobs } from '../../scheduler/schema.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { PURGE_JOB, purgeTask } from './archive.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

interface Board {
  id: string
  archived: boolean
  sections: { id: string }[]
  tasks: { id: string; title: string; sectionId: string | null }[]
}

async function aBoard(owner: TestUser, titles: string[]) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<Board>()
  const sectionId = board.sections[0]?.id ?? null
  const ids: string[] = []
  for (const title of titles) {
    ids.push(
      (
        await api
          .as(owner)
          .post(`/boards/${board.id}/tasks`, { sectionId, title })
      ).json<{ id: string }>().id
    )
  }
  return { boardId: board.id, sectionId, ids }
}

const titlesOn = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`))
    .json<Board>()
    .tasks.map(task => task.title)

const listed = async (user: TestUser, boardId: string, which: string) =>
  (await api.as(user).get(`/boards/${boardId}/${which}`))
    .json<{ tasks: { title: string }[] }>()
    .tasks.map(task => task.title)

describe('archive and trash', () => {
  it('archives a task and its sub-tasks, and restores them', async () => {
    const owner = aUser()
    const { boardId, ids } = await aBoard(owner, ['Logo', 'Palette'])
    const [logo = ''] = ids
    await api
      .as(owner)
      .post(`/boards/${boardId}/tasks`, { parentId: logo, title: 'Sketch' })

    expect(
      (await api.as(owner).post(`/boards/${boardId}/tasks/${logo}/archive`, {}))
        .statusCode
    ).toBe(204)
    expect(await titlesOn(owner, boardId)).toEqual(['Palette'])
    expect(await listed(owner, boardId, 'archived')).toEqual(['Logo'])

    await api.as(owner).post(`/boards/${boardId}/tasks/${logo}/restore`, {})
    expect(await titlesOn(owner, boardId)).toEqual(
      expect.arrayContaining(['Logo', 'Sketch', 'Palette'])
    )
    expect(await listed(owner, boardId, 'archived')).toEqual([])
  })

  it('trashes a task, schedules its purge, and cancels it on restore', async () => {
    const owner = aUser()
    const { boardId, ids } = await aBoard(owner, ['Logo'])
    const [logo = ''] = ids
    const purge = () =>
      db
        .select()
        .from(jobs)
        .where(eq(jobs.key, `${PURGE_JOB}:${logo}`))

    expect(
      (await api.as(owner).delete(`/boards/${boardId}/tasks/${logo}`))
        .statusCode
    ).toBe(204)
    expect(await titlesOn(owner, boardId)).toEqual([])
    expect(await listed(owner, boardId, 'trash')).toEqual(['Logo'])
    const [job] = await purge()
    expect(job?.runAt.getTime()).toBeGreaterThan(
      Date.now() + 29 * 24 * 3600 * 1000
    )

    await api.as(owner).post(`/boards/${boardId}/tasks/${logo}/restore`, {})
    expect(await titlesOn(owner, boardId)).toEqual(['Logo'])
    expect(await purge()).toEqual([])
  })

  it('lists a trashed task with its details and when it was trashed', async () => {
    const owner = aUser()
    const { boardId, sectionId, ids } = await aBoard(owner, ['Logo'])
    const [logo = ''] = ids
    await api.as(owner).patch(`/boards/${boardId}/tasks/${logo}`, {
      priority: 1,
      dueDate: '2030-01-15'
    })
    await api.as(owner).delete(`/boards/${boardId}/tasks/${logo}`)

    const [trashed] = (
      await api.as(owner).get(`/boards/${boardId}/trash`)
    ).json<{ tasks: Record<string, unknown>[] }>().tasks

    expect(trashed).toEqual(
      expect.objectContaining({
        key: 'DES-1',
        title: 'Logo',
        sectionId,
        priority: 1,
        dueDate: '2030-01-15',
        assignees: [],
        labels: [],
        at: expect.any(String) as string
      })
    )
  })

  it('purges a trashed task for good', async () => {
    const owner = aUser()
    const { boardId, ids } = await aBoard(owner, ['Logo'])
    const [logo = ''] = ids
    await api.as(owner).delete(`/boards/${boardId}/tasks/${logo}`)
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.key, `${PURGE_JOB}:${logo}`))

    await db.transaction(tx => purgeTask(job?.payload, tx))

    expect(await listed(owner, boardId, 'trash')).toEqual([])
  })

  it('moves a task between visible neighbours across a hidden one', async () => {
    const owner = aUser()
    const { boardId, sectionId, ids } = await aBoard(owner, [
      'A',
      'B',
      'C',
      'D'
    ])
    const [a = '', b = '', c = '', d = ''] = ids
    await api.as(owner).delete(`/boards/${boardId}/tasks/${b}`)

    const moved = await api
      .as(owner)
      .post(`/boards/${boardId}/tasks/${d}/move`, {
        sectionId,
        afterId: a,
        beforeId: c
      })

    expect(moved.statusCode).toBe(204)
    expect(await titlesOn(owner, boardId)).toEqual(['A', 'D', 'C'])
    await api.as(owner).post(`/boards/${boardId}/tasks/${b}/restore`, {})
    expect(await titlesOn(owner, boardId)).toEqual(['A', 'D', 'B', 'C'])
  })

  it('deletes a section whose tasks are all archived', async () => {
    const owner = aUser()
    const { boardId, sectionId, ids } = await aBoard(owner, ['Logo'])
    const [logo = ''] = ids
    await api.as(owner).post(`/boards/${boardId}/tasks/${logo}/archive`, {})

    expect(
      (
        await api
          .as(owner)
          .delete(`/boards/${boardId}/sections/${sectionId ?? ''}`)
      ).statusCode
    ).toBe(204)
    await api.as(owner).post(`/boards/${boardId}/tasks/${logo}/restore`, {})
    expect(
      (await api.as(owner).get(`/boards/${boardId}`)).json<Board>().tasks
    ).toEqual([expect.objectContaining({ title: 'Logo', sectionId: null })])
  })

  it('lets only editors archive or trash, and keeps archived boards read only', async () => {
    const owner = aUser()
    const viewer = aUser({ organizationId: owner.organizationId })
    const { boardId, ids } = await aBoard(owner, ['Logo'])
    const [logo = ''] = ids
    await api.as(owner).post(`/boards/${boardId}/invites`, {
      email: viewer.email,
      role: 'viewer'
    })
    await api.as(viewer).get('/boards')

    expect(
      (await api.as(viewer).delete(`/boards/${boardId}/tasks/${logo}`))
        .statusCode
    ).toBe(403)
    expect(
      (await api.as(viewer).post(`/boards/${boardId}/archive`, {})).statusCode
    ).toBe(403)
    expect(
      (await api.as(owner).post(`/boards/${boardId}/archive`, {})).statusCode
    ).toBe(204)
    expect(
      (await api.as(owner).get(`/boards/${boardId}`)).json<Board>().archived
    ).toBe(true)
    expect(
      (await api.as(owner).delete(`/boards/${boardId}/tasks/${logo}`))
        .statusCode
    ).toBe(409)
    expect(
      (await api.as(owner).post(`/boards/${boardId}/unarchive`, {})).statusCode
    ).toBe(204)
    expect(
      (await api.as(owner).get(`/boards/${boardId}`)).json<Board>().archived
    ).toBe(false)
  })
})
