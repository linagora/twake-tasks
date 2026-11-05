import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import type { Mail } from '../../infra/mail.ts'
import { createScheduler } from '../../scheduler/scheduler.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'
import { userSettings } from '../settings/index.ts'
import {
  emailDailySummary,
  NOTIFICATION_DAILY_JOB
} from './notificationDaily.ts'
import { emailDigest, NOTIFICATION_DIGEST_JOB } from './notificationDigest.ts'
import {
  emailNotification,
  NOTIFICATION_EMAIL_JOB
} from './notificationEmails.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function aMailbox(budget = { max: 0, windowSeconds: 600 }) {
  const sent: Mail[] = []
  const deps = {
    appUrl: 'https://tasks.example.com/',
    budget,
    send: (mail: Mail) => {
      sent.push(mail)
      return Promise.resolve()
    }
  }
  const scheduler = createScheduler({
    db,
    logger: pino({ level: 'silent' }),
    handlers: {
      [NOTIFICATION_EMAIL_JOB]: emailNotification(deps),
      [NOTIFICATION_DIGEST_JOB]: emailDigest(deps),
      [NOTIFICATION_DAILY_JOB]: emailDailySummary(deps)
    }
  })
  // The job queue is shared with the other test files, which may have filled
  // it with more than one batch: deliver until nothing is due
  const deliver = async (): Promise<void> => {
    for (let batch = 0; batch < 20; batch++) {
      if ((await scheduler.runDue()) === 0) return
    }
    throw new Error('The job queue was not drained after 20 batches')
  }
  return { sent, deliver }
}

// A second back, not now(): the scheduler compares run_at with a JavaScript
// Date, which has milliseconds where Postgres has microseconds, so a job moved
// to now() is not yet due within the same millisecond.
async function makeDue(kind: string, userId: string) {
  await sql`update jobs set run_at = now() - interval '1 second'
    where kind = ${kind} and payload->>'userId' = ${userId}`
}

describe('notification emails', () => {
  async function aTask(title = 'Logo') {
    const alice = aUser({ name: 'Alice Martin' })
    const bob = aUser({ organizationId: alice.organizationId })
    const board = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()
    await joinBoard(db, alice, board.id, bob, 'editor')
    const task = (
      await api
        .as(alice)
        .post(`/boards/${board.id}/tasks`, { sectionId: null, title })
    ).json<{ id: string; key: string }>()
    return { alice, bob, board, task }
  }

  it('tells the assignee who assigned them, with a link to the task', async () => {
    const { alice, bob, board, task } = await aTask()
    const mailbox = aMailbox()

    await api.as(alice).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
      userIds: [bob.userId]
    })
    await mailbox.deliver()

    const sent = mailbox.sent.filter(mail => mail.text.includes(board.id))
    const link = `https://tasks.example.com/boards/${board.id}?task=${task.key}`
    expect(sent).toEqual([
      {
        to: bob.email,
        subject: `Alice Martin assigned you ${task.key} Logo`,
        text: expect.stringContaining(link) as string,
        html: expect.stringContaining(`href="${link}"`) as string,
        headers: expect.objectContaining({
          'List-Unsubscribe': expect.stringContaining('kind=assigned') as string
        }) as Record<string, string>
      }
    ])
    expect(sent[0]?.text).toContain('Alice Martin assigned you a task')
    expect(sent[0]?.html).toContain('Alice Martin assigned you a task')
  })

  it('tells the person unassigned that it was them', async () => {
    const { alice, bob, board, task } = await aTask()
    const path = `/boards/${board.id}/tasks/${task.id}/assignees`
    await api.as(alice).put(path, { userIds: [bob.userId] })
    const mailbox = aMailbox()

    await api.as(alice).put(path, { userIds: [] })
    await mailbox.deliver()

    const lines = mailbox.sent
      .filter(mail => mail.to === bob.email && mail.text.includes(board.id))
      .map(mail => mail.text.split('\n')[0])
    expect(lines).toContain('Alice Martin unassigned you')
  })

  it('quotes the comment that mentions someone', async () => {
    const { alice, bob, board, task } = await aTask()
    const mailbox = aMailbox()

    await api.as(alice).post(`/boards/${board.id}/tasks/${task.id}/comments`, {
      body: `@${bob.email} can you check the **contrast**?`
    })
    await mailbox.deliver()

    const [mail] = mailbox.sent.filter(
      each => each.to === bob.email && each.text.includes(board.id)
    )
    expect(mail?.subject).toBe(`Alice Martin mentioned you on ${task.key} Logo`)
    expect(mail?.text).toContain(`@${bob.email} can you check the contrast?`)
    expect(mail?.html).toContain('can you check the contrast?')
  })

  it('says what changed to a follower', async () => {
    const { alice, bob, board, task } = await aTask()
    await api.as(bob).post(`/boards/${board.id}/tasks/${task.id}/comments`, {
      body: 'Following along'
    })
    const mailbox = aMailbox()

    await api
      .as(alice)
      .patch(`/boards/${board.id}/tasks/${task.id}`, { priority: 1 })
    await mailbox.deliver()

    const [mail] = mailbox.sent.filter(
      each => each.to === bob.email && each.text.includes(board.id)
    )
    expect(mail?.subject).toBe(`${task.key} Logo`)
    expect(mail?.text.split('\n')[0]).toBe(
      'Alice Martin set the priority to P1'
    )
  })

  const repeat = { every: 1, unit: 'weeks', fromCompletion: false }
  it.each([
    ['archived', 'archived the task'],
    ['unarchived', 'restored the task from the archive'],
    ['deleted', 'deleted the task'],
    ['undeleted', 'restored the task from the trash'],
    ['repeating', 'set the task to repeat'],
    ['not repeating', 'stopped the task from repeating']
  ])('tells a follower the task is %s', async (change, line) => {
    const { alice, bob, board, task } = await aTask()
    const path = `/boards/${board.id}/tasks/${task.id}`
    const as = api.as(alice)
    const changes: Record<string, () => Promise<unknown>> = {
      archived: () => as.post(`${path}/archive`, {}),
      unarchived: () => as.post(`${path}/restore`, {}),
      deleted: () => as.delete(path),
      undeleted: () => as.post(`${path}/restore`, {}),
      repeating: () => as.patch(path, { recurrence: repeat }),
      'not repeating': () => as.patch(path, { recurrence: null })
    }
    const before: Record<string, (() => Promise<unknown>)[]> = {
      unarchived: [changes.archived as () => Promise<unknown>],
      undeleted: [changes.deleted as () => Promise<unknown>],
      repeating: [() => as.patch(path, { dueDate: '2026-10-13' })],
      'not repeating': [
        () => as.patch(path, { dueDate: '2026-10-13' }),
        changes.repeating as () => Promise<unknown>
      ]
    }
    for (const step of before[change] ?? []) await step()
    await api.as(bob).put(`${path}/follow`, {})
    const mailbox = aMailbox()

    await (changes[change] as () => Promise<unknown>)()
    await mailbox.deliver()

    const [mail] = mailbox.sent.filter(
      each => each.to === bob.email && each.text.includes(board.id)
    )
    expect(mail?.text.split('\n')[0]).toBe(`Alice Martin ${line}`)
  })

  it('tells a follower the task is no longer blocked', async () => {
    const { alice, bob, board, task } = await aTask()
    const blocker = (
      await api
        .as(alice)
        .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Brief' })
    ).json<{ id: string; key: string }>()
    const path = `/boards/${board.id}/tasks/${task.id}`
    await api
      .as(alice)
      .post(`${path}/links`, { kind: 'blockedBy', taskId: blocker.id })
    await api.as(bob).put(`${path}/follow`, {})
    const mailbox = aMailbox()

    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/${blocker.id}/complete`, {
        state: 'completed'
      })
    await mailbox.deliver()

    const [mail] = mailbox.sent.filter(
      each => each.to === bob.email && each.text.includes(board.id)
    )
    expect(mail?.text.split('\n')[0]).toBe(
      `${blocker.key} is done, the task is no longer blocked`
    )
  })

  it('announces a due date that has a time', async () => {
    const { alice, bob, board, task } = await aTask()
    await api.as(bob).post(`/boards/${board.id}/tasks/${task.id}/comments`, {
      body: 'Following along'
    })
    const mailbox = aMailbox()

    await api.as(alice).patch(`/boards/${board.id}/tasks/${task.id}`, {
      dueDate: '2026-10-13',
      dueTime: '15:00'
    })
    await mailbox.deliver()

    const [mail] = mailbox.sent.filter(
      each => each.to === bob.email && each.text.includes(board.id)
    )
    expect(mail?.text.split('\n')[0]).toBe(
      'Alice Martin set the due date to Tue, Oct 13, 15:00'
    )
    expect(mail?.text).toContain('Due Tue, Oct 13, 15:00')
    expect(mail?.html).toContain('Due Tue, Oct 13, 15:00')
  })

  it('shows the time of a due date in the zone it was set in', async () => {
    const { alice, bob, board, task } = await aTask()
    await api.as(bob).post(`/boards/${board.id}/tasks/${task.id}/comments`, {
      body: 'Following along'
    })
    const mailbox = aMailbox()

    await api.as(alice).patch(`/boards/${board.id}/tasks/${task.id}`, {
      dueDate: '2026-10-14',
      dueTime: '09:00',
      dueZone: 'Europe/Paris'
    })
    await mailbox.deliver()
    await api.as(bob).post('/notifications/read', {})
    await api.as(alice).patch(`/boards/${board.id}/tasks/${task.id}`, {
      dueTime: '15:00'
    })
    await mailbox.deliver()

    const firstLines = mailbox.sent
      .filter(each => each.to === bob.email && each.text.includes(board.id))
      .map(each => each.text.split('\n')[0])
    expect(firstLines).toEqual([
      'Alice Martin set the due date to Wed, Oct 14, 09:00 Europe/Paris',
      'Alice Martin set the due date to Wed, Oct 14, 15:00 Europe/Paris'
    ])
  })

  it('names the board a followed task moved to', async () => {
    const { alice, bob, board, task } = await aTask()
    const { project } = (await api.as(alice).get(`/boards/${board.id}`)).json<{
      project: { id: string }
    }>()
    const ops = (
      await api.as(alice).post('/boards', {
        name: 'Ops',
        keyPrefix: 'OPS',
        projectId: project.id
      })
    ).json<{ id: string }>()
    await api.as(bob).post(`/boards/${board.id}/tasks/${task.id}/comments`, {
      body: 'Following along'
    })
    const mailbox = aMailbox()

    await api.as(alice).post(`/boards/${board.id}/tasks/${task.id}/transfer`, {
      boardId: ops.id,
      sectionId: null
    })
    await mailbox.deliver()

    const [mail] = mailbox.sent.filter(
      each => each.to === bob.email && each.text.includes(ops.id)
    )
    expect(mail?.text.split('\n')[0]).toBe(
      'Alice Martin moved the task to the board Ops'
    )
  })

  it('writes in the language the person chose, and escapes what people typed', async () => {
    const { alice, bob, board, task } = await aTask('<b>Logo</b> & co')
    await db
      .insert(userSettings)
      .values({ email: bob.email, version: 1, language: 'fr' })
    const mailbox = aMailbox()

    await api.as(alice).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
      userIds: [bob.userId]
    })
    await mailbox.deliver()

    const [mail] = mailbox.sent.filter(each => each.text.includes(board.id))
    expect(mail?.subject).toBe(
      `Alice Martin vous a assigné ${task.key} <b>Logo</b> & co`
    )
    expect(mail?.html).toContain('&lt;b&gt;Logo&lt;/b&gt; &amp; co')
    expect(mail?.html).not.toContain('<b>Logo</b>')
    expect(mail?.html).toContain('Ouvrir la tâche')
  })

  it('holds the emails past a person’s budget, then sends one digest counting them', async () => {
    const { alice, bob, board } = await aTask()
    const mailbox = aMailbox({ max: 2, windowSeconds: 600 })
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
      const task = (
        await api
          .as(alice)
          .post(`/boards/${board.id}/tasks`, { sectionId: null, title })
      ).json<{ id: string }>()
      await api
        .as(alice)
        .put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
          userIds: [bob.userId]
        })
    }
    await mailbox.deliver()
    const toBob = () => mailbox.sent.filter(mail => mail.to === bob.email)
    expect(toBob()).toHaveLength(2)

    await sql`update notification_email_budgets
      set window_start = window_start - interval '1 hour'
      where user_id = ${bob.userId}`
    await makeDue(NOTIFICATION_DIGEST_JOB, bob.userId)
    await mailbox.deliver()
    await mailbox.deliver()

    expect(toBob().slice(2)).toEqual([
      {
        to: bob.email,
        subject: '3 more notifications',
        text: expect.stringContaining(
          'https://tasks.example.com/notifications'
        ) as string,
        html: expect.stringContaining('See all notifications') as string,
        headers: expect.objectContaining({
          'List-Unsubscribe': expect.stringContaining('kind=all') as string
        }) as Record<string, string>
      }
    ])
  })

  it('gives a failed send its place in the budget back', async () => {
    const { alice, bob, board, task } = await aTask()
    const mailbox = aMailbox({ max: 1, windowSeconds: 600 })
    const failing = createScheduler({
      db,
      logger: pino({ level: 'silent' }),
      handlers: {
        [NOTIFICATION_EMAIL_JOB]: emailNotification({
          appUrl: 'https://tasks.example.com/',
          budget: { max: 1, windowSeconds: 600 },
          send: () => Promise.reject(new Error('mail server down'))
        })
      }
    })
    await api.as(alice).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
      userIds: [bob.userId]
    })
    await failing.runDue()

    await makeDue(NOTIFICATION_EMAIL_JOB, bob.userId)
    await mailbox.deliver()

    expect(
      mailbox.sent
        .filter(mail => mail.to === bob.email)
        .map(mail => mail.subject)
    ).toEqual([`Alice Martin assigned you ${task.key} Logo`])
  })

  it('sends a digest only for what is still held once a budget has room again', async () => {
    const { alice, bob, board, task } = await aTask()
    const mailbox = aMailbox({ max: 1, windowSeconds: 600 })
    await api.as(alice).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
      userIds: [bob.userId]
    })
    await api.as(alice).post(`/boards/${board.id}/tasks/${task.id}/comments`, {
      body: `@${bob.email} have a look`
    })
    await mailbox.deliver()
    await sql`update notification_email_budgets
      set window_start = window_start - interval '1 hour'
      where user_id = ${bob.userId}`
    await makeDue(NOTIFICATION_DIGEST_JOB, bob.userId)
    await mailbox.deliver()
    await mailbox.deliver()

    expect(
      mailbox.sent
        .filter(mail => mail.to === bob.email)
        .map(mail => mail.subject)
    ).toEqual([
      `Alice Martin assigned you ${task.key} Logo`,
      '1 more notification'
    ])
  })

  it('sends nothing to someone the task left behind when it moved boards', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const design = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()
    const ops = (
      await api.as(alice).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    ).json<{ id: string }>()
    await joinBoard(db, alice, design.id, bob, 'editor')
    const task = (
      await api
        .as(alice)
        .post(`/boards/${design.id}/tasks`, { sectionId: null, title: 'Logo' })
    ).json<{ id: string }>()
    const mailbox = aMailbox()
    await api.as(alice).put(`/boards/${design.id}/tasks/${task.id}/assignees`, {
      userIds: [bob.userId]
    })

    await api.as(alice).post(`/boards/${design.id}/tasks/${task.id}/transfer`, {
      boardId: ops.id,
      sectionId: null
    })
    await api.as(alice).patch(`/boards/${ops.id}/tasks/${task.id}`, {
      title: 'New logo'
    })
    await mailbox.deliver()

    expect(mailbox.sent.filter(mail => mail.to === bob.email)).toEqual([])
  })
})

// Here and not in a file of their own: a second file running the email jobs
// at the same time would take the other's jobs off the shared queue.
async function aFollowedTask() {
  const alice = aUser({ name: 'Alice Martin' })
  const bob = aUser({ organizationId: alice.organizationId })
  const board = (
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string }>()
  await joinBoard(db, alice, board.id, bob, 'editor')
  const task = (
    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string; key: string }>()
  const path = `/boards/${board.id}/tasks/${task.id}`
  await api.as(bob).put(`${path}/follow`, {})
  return { alice, bob, board, task, path }
}

const choose = (
  user: TestUser,
  preferences: {
    mutedInApp?: string[]
    mutedEmail?: string[]
    emailFrequency?: string
  }
) =>
  api.as(user).put('/settings/notifications', {
    mutedInApp: [],
    mutedEmail: [],
    emailFrequency: 'instant',
    ...preferences
  })

async function notificationsOf(user: TestUser) {
  return (await api.as(user).get('/notifications')).json<{
    notifications: { id: string; reason: string; change: unknown }[]
  }>().notifications
}

const mailsTo = (sent: Mail[], user: TestUser, boardId: string) =>
  sent.filter(mail => mail.to === user.email && mail.text.includes(boardId))

describe('notification settings', () => {
  it('turns every kind on for someone who never chose', async () => {
    const response = await api.as(aUser()).get('/settings/notifications')

    expect(response.json()).toEqual({
      mutedInApp: [],
      mutedEmail: [],
      emailFrequency: 'instant'
    })
  })

  it('keeps a kind turned off in the app off by email too', async () => {
    const user = aUser()

    const saved = await choose(user, { mutedInApp: ['changes'] })

    expect(saved.json()).toEqual({
      mutedInApp: ['changes'],
      mutedEmail: ['changes'],
      emailFrequency: 'instant'
    })
    expect((await api.as(user).get('/settings/notifications')).json()).toEqual(
      saved.json()
    )
  })

  it('refuses a kind it does not know', async () => {
    const response = await choose(aUser(), { mutedEmail: ['everything'] })

    expect(response.statusCode).toBe(400)
  })

  it('still shows a change in the app with its email off', async () => {
    const { alice, bob, board, path } = await aFollowedTask()
    await choose(bob, { mutedEmail: ['changes'] })
    const mailbox = aMailbox()

    await api.as(alice).patch(path, { priority: 1 })
    await mailbox.deliver()

    expect(await notificationsOf(bob)).toHaveLength(1)
    expect(mailsTo(mailbox.sent, bob, board.id)).toEqual([])
  })

  it('drops changes turned off in the app, but not an assignment', async () => {
    const { alice, bob, board, path } = await aFollowedTask()
    await choose(bob, { mutedInApp: ['changes'] })
    const mailbox = aMailbox()

    await api.as(alice).patch(path, { priority: 1 })
    await mailbox.deliver()
    expect(await notificationsOf(bob)).toEqual([])
    expect(mailsTo(mailbox.sent, bob, board.id)).toEqual([])

    await api.as(alice).put(`${path}/assignees`, { userIds: [bob.userId] })
    await mailbox.deliver()
    expect((await notificationsOf(bob)).map(each => each.reason)).toEqual([
      'assigned'
    ])
    expect(mailsTo(mailbox.sent, bob, board.id)).toHaveLength(1)
  })

  it('drops comments turned off, but still tells of a rename', async () => {
    const { alice, bob, path } = await aFollowedTask()
    await choose(bob, { mutedInApp: ['comments'] })

    await api.as(alice).post(`${path}/comments`, { body: 'Looks good' })
    expect(await notificationsOf(bob)).toEqual([])

    await api.as(alice).patch(path, { title: 'New logo' })
    expect(await notificationsOf(bob)).toHaveLength(1)
  })

  it('emails nothing with the frequency never', async () => {
    const { alice, bob, board, path } = await aFollowedTask()
    await choose(bob, { emailFrequency: 'never' })
    const mailbox = aMailbox()

    await api.as(alice).put(`${path}/assignees`, { userIds: [bob.userId] })
    await mailbox.deliver()

    expect(await notificationsOf(bob)).toHaveLength(1)
    expect(mailsTo(mailbox.sent, bob, board.id)).toEqual([])
  })

  it('sends one daily summary at 8:00 in the time zone of the person', async () => {
    const { alice, bob, board, task, path } = await aFollowedTask()
    await db.insert(userSettings).values({
      email: bob.email.toLowerCase(),
      version: 1,
      timezone: 'Asia/Tokyo'
    })
    await choose(bob, { emailFrequency: 'daily' })
    const mailbox = aMailbox()

    await api.as(alice).put(`${path}/assignees`, { userIds: [bob.userId] })
    await api.as(alice).post(`${path}/comments`, { body: 'Looks good' })
    await mailbox.deliver()
    expect(mailsTo(mailbox.sent, bob, board.id)).toEqual([])

    const jobs = await sql<{ runAt: string }[]>`
      select run_at as "runAt" from jobs
      where kind = ${NOTIFICATION_DAILY_JOB} and user_id = ${bob.userId}`
    expect(jobs).toHaveLength(1)
    const runAt = new Date(jobs[0]?.runAt ?? '')
    expect(
      new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).format(runAt)
    ).toBe('08:00')
    expect(runAt.getTime() - Date.now()).toBeLessThanOrEqual(86_400_000)

    await makeDue(NOTIFICATION_DAILY_JOB, bob.userId)
    await mailbox.deliver()

    const sent = mailsTo(mailbox.sent, bob, board.id)
    expect(sent.map(mail => mail.subject)).toEqual([
      'Your daily summary: 2 notifications'
    ])
    expect(sent[0]?.text).toContain(`Assignment · ${task.key} Logo`)
    expect(sent[0]?.text).toContain(`Comment · ${task.key} Logo`)
  })

  it('ends each email with links to change or stop it', async () => {
    const { alice, bob, board, path } = await aFollowedTask()
    const mailbox = aMailbox()

    await api.as(alice).patch(path, { priority: 1 })
    await mailbox.deliver()

    const [mail] = mailsTo(mailbox.sent, bob, board.id)
    const unsubscribe =
      /https:\/\/tasks\.example\.com\/unsubscribe\?token=([0-9a-f-]+)&kind=changes/.exec(
        mail?.text ?? ''
      )
    expect(unsubscribe).not.toBeNull()
    expect(mail?.text).toContain(
      'Change which emails you get: https://tasks.example.com/settings#notifications'
    )
    expect(mail?.headers).toEqual({
      'List-Unsubscribe': `<https://tasks.example.com/api/settings/notifications/unsubscribe?token=${unsubscribe?.[1] ?? ''}&kind=changes>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    })
  })

  it('turns an email off from its one-click link, without a session', async () => {
    const { alice, bob, board, path } = await aFollowedTask()
    const mailbox = aMailbox()
    await api.as(alice).patch(path, { priority: 1 })
    await mailbox.deliver()
    const [mail] = mailsTo(mailbox.sent, bob, board.id)
    const url = /<https:\/\/tasks\.example\.com(\/api\/[^>]+)>/.exec(
      mail?.headers?.['List-Unsubscribe'] ?? ''
    )?.[1]

    const response = await api.inject({
      method: 'POST',
      url: url ?? '',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click'
    })

    expect(response.statusCode).toBe(204)
    expect(
      (await api.as(bob).get('/settings/notifications')).json()
    ).toMatchObject({ mutedEmail: ['changes'], emailFrequency: 'instant' })
  })

  it('refuses a link no email carried', async () => {
    const response = await api.inject({
      method: 'POST',
      url: `/api/settings/notifications/unsubscribe?token=${crypto.randomUUID()}&kind=all`
    })

    expect(response.statusCode).toBe(404)
  })

  it('removes a notification for good', async () => {
    const { alice, bob, path } = await aFollowedTask()
    await api.as(alice).patch(path, { priority: 1 })
    const [notification] = await notificationsOf(bob)

    const removed = await api
      .as(bob)
      .delete(`/notifications/${notification?.id ?? ''}`)
    const again = await api
      .as(bob)
      .delete(`/notifications/${notification?.id ?? ''}`)

    expect(removed.statusCode).toBe(204)
    expect(again.statusCode).toBe(404)
    expect(await notificationsOf(bob)).toEqual([])
  })

  it("does not remove someone else's notification", async () => {
    const { alice, bob, path } = await aFollowedTask()
    await api.as(alice).patch(path, { priority: 1 })
    const [notification] = await notificationsOf(bob)

    const response = await api
      .as(alice)
      .delete(`/notifications/${notification?.id ?? ''}`)

    expect(response.statusCode).toBe(404)
    expect(await notificationsOf(bob)).toHaveLength(1)
  })
})
