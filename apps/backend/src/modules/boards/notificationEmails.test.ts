import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { createScheduler } from '../../scheduler/scheduler.ts'
import { aUser, joinBoard, startApp } from '../../testing/app.ts'
import { userSettings } from '../settings/schema.ts'
import {
  emailNotification,
  NOTIFICATION_EMAIL_JOB,
  type Mail
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

function aMailbox() {
  const sent: Mail[] = []
  const scheduler = createScheduler({
    db,
    logger: pino({ level: 'silent' }),
    handlers: {
      [NOTIFICATION_EMAIL_JOB]: emailNotification({
        appUrl: 'https://tasks.example.com/',
        send: mail => {
          sent.push(mail)
          return Promise.resolve()
        }
      })
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
        html: expect.stringContaining(`href="${link}"`) as string
      }
    ])
    expect(sent[0]?.text).toContain('Alice Martin assigned you a task')
    expect(sent[0]?.html).toContain('Alice Martin assigned you a task')
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
