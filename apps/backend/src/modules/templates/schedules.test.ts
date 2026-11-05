import { eq } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { createScheduler } from '../../scheduler/scheduler.ts'
import { jobs } from '../../scheduler/schema.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'
import { userSettings } from '../settings/index.ts'
import { runSchedule, TEMPLATE_SCHEDULE_JOB } from './scheduleJob.ts'

interface Schedule {
  boardId: string
  zone: string
  paused: boolean
  pausedBy: 'author' | 'board' | null
  nextRunAt: string | null
}

interface Template {
  id: string
  title: string
  schedule: Schedule | null
}

interface Board {
  sections: { id: string; category: string }[]
  tasks: {
    id: string
    title: string
    sectionId: string | null
    priority: number | null
    template: { id: string } | null
    labels: { id: string }[]
    assignees: { userId: string }[]
  }[]
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

// Each run reads this clock, so a test moves it past the run it waits for.
let clock = new Date()
const now = () => clock
const replica = () =>
  createScheduler({
    db,
    logger: pino({ level: 'silent' }),
    handlers: { [TEMPLATE_SCHEDULE_JOB]: runSchedule(now) },
    now
  })

const daily = {
  rule: { kind: 'daily', every: 1 },
  time: '08:00',
  zone: 'Europe/Paris',
  workingDays: false,
  endsOn: null,
  paused: false
}

// The author, when not the board's owner, joins the board as an editor.
async function aScheduledTemplate(
  user: TestUser,
  schedule: object = {},
  author = user
) {
  const as = api.as(user)
  const board = (
    await as.post('/boards', { name: 'Finance', keyPrefix: 'FIN' })
  ).json<{ id: string; project: { id: string } }>()
  if (author !== user) await joinBoard(db, user, board.id, author, 'editor')
  const path = `/projects/${board.project.id}/templates`
  const fields = {
    title: 'Close the monthly report',
    description: 'Check the **invoices**',
    priority: 2,
    labelIds: [],
    assigneeIds: []
  }
  const created = await api.as(author).post(path, {
    ...fields,
    schedule: { ...daily, boardId: board.id, ...schedule }
  })
  const template = created.json<Template>()
  return {
    board,
    created,
    template,
    edit: (body: object, by: TestUser = user) =>
      api
        .as(by)
        .put(`${path}/${template.id}`, { ...fields, ...body })
        .then(reply => reply.json<Template>()),
    reload: async (by: TestUser = user) =>
      (await api.as(by).get('/templates'))
        .json<{ templates: Template[] }>()
        .templates.find(each => each.id === template.id),
    tasks: async () =>
      (await as.get(`/boards/${board.id}`)).json<Board>().tasks,
    runAt: (at: string | null | undefined) => {
      if (!at) throw new Error('no run planned')
      clock = new Date(at)
      return replica().runDue()
    }
  }
}

const later = (at: string | null | undefined, days: number) =>
  new Date(Date.parse(at ?? '') + days * 864e5).toISOString()

describe('template schedules', () => {
  it('plan the first run in the zone of the person settings, else of the browser', async () => {
    const alice = aUser()
    const { created, template, edit, board } = await aScheduledTemplate(alice, {
      zone: 'America/New_York'
    })
    await db
      .insert(userSettings)
      .values({ email: alice.email, version: 1, timezone: 'Asia/Tokyo' })

    const edited = await edit({
      schedule: { ...daily, boardId: board.id, zone: 'America/New_York' }
    })

    expect(created.statusCode).toBe(201)
    expect(template.schedule).toMatchObject({
      zone: 'America/New_York',
      paused: false,
      pausedBy: null
    })
    const first = new Date(template.schedule?.nextRunAt ?? '')
    expect(first.getTime()).toBeGreaterThan(Date.now())
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/New_York',
        timeStyle: 'short'
      }).format(first)
    ).toBe('08:00')
    expect(edited.schedule?.zone).toBe('Asia/Tokyo')
  })

  it('make the task when its run is due, as the template would', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const scheduled = await aScheduledTemplate(alice)
    await joinBoard(db, alice, scheduled.board.id, bob, 'editor')
    const label = (
      await api
        .as(alice)
        .post(`/boards/${scheduled.board.id}/labels`, { name: 'Monthly' })
    ).json<{ id: string }>()
    const { schedule } = await scheduled.edit({
      labelIds: [label.id],
      assigneeIds: [bob.userId]
    })

    await scheduled.runAt(schedule?.nextRunAt)

    const sections = (
      await api.as(alice).get(`/boards/${scheduled.board.id}`)
    ).json<Board>().sections
    expect(await scheduled.tasks()).toMatchObject([
      {
        title: 'Close the monthly report',
        sectionId: sections.find(each => each.category === 'unstarted')?.id,
        priority: 2,
        template: { id: scheduled.template.id },
        labels: [{ id: label.id }],
        assignees: [{ userId: bob.userId }]
      }
    ])
    expect((await scheduled.reload())?.schedule?.nextRunAt).toBe(
      later(schedule?.nextRunAt, 1)
    )
  })

  it('make one task for the runs they missed, then wait for the next one', async () => {
    const alice = aUser()
    const scheduled = await aScheduledTemplate(alice)
    const due = scheduled.template.schedule?.nextRunAt

    await scheduled.runAt(later(due, 5))

    expect(await scheduled.tasks()).toHaveLength(1)
    expect((await scheduled.reload())?.schedule?.nextRunAt).toBe(later(due, 6))
  })

  it('make one task however many replicas run at once', async () => {
    const alice = aUser()
    const scheduled = await aScheduledTemplate(alice)
    clock = new Date(scheduled.template.schedule?.nextRunAt ?? '')

    await Promise.all([replica().runDue(), replica().runDue()])

    expect(await scheduled.tasks()).toHaveLength(1)
  })

  it('keep the next run when the template changes but its schedule does not', async () => {
    const alice = aUser()
    const { template, edit, board } = await aScheduledTemplate(alice)

    const renamed = await edit({ title: 'Close the books' })
    const resaved = await edit({ schedule: { ...daily, boardId: board.id } })

    expect(renamed.schedule).toEqual(template.schedule)
    expect(resaved.schedule).toEqual(template.schedule)
  })

  it('make nothing while paused, and count from now once resumed', async () => {
    const alice = aUser()
    const scheduled = await aScheduledTemplate(alice)
    const due = scheduled.template.schedule?.nextRunAt
    const schedule = { ...daily, boardId: scheduled.board.id }

    const paused = await scheduled.edit({
      schedule: { ...schedule, paused: true }
    })
    await scheduled.runAt(later(due, 2))
    const resumed = await scheduled.edit({ schedule })

    expect(paused.schedule).toMatchObject({ paused: true, nextRunAt: null })
    expect(await scheduled.tasks()).toEqual([])
    expect(resumed.schedule?.nextRunAt).toBe(due)
  })

  it('end after their end date', async () => {
    const alice = aUser()
    const { template } = await aScheduledTemplate(alice, {
      endsOn: '2020-01-01'
    })
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.key, `${TEMPLATE_SCHEDULE_JOB}:${template.id}`))

    expect(template.schedule).toMatchObject({ paused: false, nextRunAt: null })
    expect(job).toBeUndefined()
  })

  it('pause when their author can no longer add tasks, until another editor resumes them', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const scheduled = await aScheduledTemplate(alice, {}, bob)
    const schedule = { ...daily, boardId: scheduled.board.id }
    await api
      .as(alice)
      .delete(`/boards/${scheduled.board.id}/members/${bob.userId}`)
    const shown = await scheduled.reload()

    await scheduled.runAt(scheduled.template.schedule?.nextRunAt)
    const missed = await scheduled.tasks()
    const resumed = await scheduled.edit({ schedule })
    await scheduled.runAt(resumed.schedule?.nextRunAt)

    expect(shown?.schedule).toMatchObject({
      paused: true,
      pausedBy: 'author',
      nextRunAt: null
    })
    expect(missed).toEqual([])
    expect(resumed.schedule).toMatchObject({ paused: false, pausedBy: null })
    expect(await scheduled.tasks()).toHaveLength(1)
  })

  it('pause when their board is archived', async () => {
    const alice = aUser()
    const scheduled = await aScheduledTemplate(alice)
    await api.as(alice).post(`/boards/${scheduled.board.id}/archive`, {})

    await scheduled.runAt(scheduled.template.schedule?.nextRunAt)

    expect((await scheduled.reload())?.schedule).toMatchObject({
      paused: true,
      pausedBy: 'board',
      nextRunAt: null
    })
  })

  it('refuse a board of another project', async () => {
    const alice = aUser()
    const other = (
      await api.as(alice).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    ).json<{ id: string }>()

    const { created } = await aScheduledTemplate(alice, { boardId: other.id })

    expect(created.json()).toEqual({ error: 'not_found' })
  })
})
