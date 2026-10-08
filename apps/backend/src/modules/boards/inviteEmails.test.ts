import { eq, like } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { createScheduler } from '../../scheduler/scheduler.ts'
import { jobs } from '../../scheduler/schema.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'
import { userSettings } from '../settings/schema.ts'
import { emailInvite, PROJECT_INVITE_EMAIL_JOB } from './inviteEmails.ts'
import type { Mail } from './notificationEmails.ts'
import { boards, inviteEmails } from './schema.ts'
import { EMAILS_PER_INVITER } from './sharing.ts'

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
      [PROJECT_INVITE_EMAIL_JOB]: emailInvite({
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

async function aSharedBoard(owner: ReturnType<typeof aUser>) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Roadmap', keyPrefix: 'RDM' })
  ).json<{ id: string }>()
  return board.id
}

const invite = (
  by: ReturnType<typeof aUser>,
  boardId: string,
  email: string,
  role: string
) => api.as(by).post(`/boards/${boardId}/invites`, { email, role })

describe('project invite emails', () => {
  it('emails the invitee who shared, the board, the role and the link', async () => {
    const alice = aUser({ email: 'alice@example.com', name: 'Alice Martin' })
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()

    await invite(alice, boardId, 'Newcomer@Example.com', 'editor')
    await mailbox.deliver()

    const sent = mailbox.sent.filter(mail => mail.text.includes(boardId))
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('newcomer@example.com')
    expect(sent[0]?.subject).toBe('Alice Martin shared "Roadmap" with you')
    expect(sent[0]?.text).toContain('Alice Martin')
    expect(sent[0]?.text).toContain('Roadmap')
    expect(sent[0]?.text).toContain(
      'Alice Martin shared the board "Roadmap" with you, as editor. It belongs to the project "'
    )
    expect(sent[0]?.text).toContain('whose boards you can now open.')
    expect(sent[0]?.text).toContain(
      `https://tasks.example.com/boards/${boardId}`
    )
  })

  it('sends nothing more when the same address is invited again with the same role', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()
    await invite(alice, boardId, 'again@example.com', 'viewer')
    await mailbox.deliver()

    await invite(alice, boardId, 'again@example.com', 'viewer')
    await mailbox.deliver()

    expect(
      mailbox.sent.filter(mail => mail.text.includes(boardId))
    ).toHaveLength(1)
  })

  it('writes in the language of an invitee who has chosen one', async () => {
    const alice = aUser({ name: 'Alice Martin' })
    const boardId = await aSharedBoard(alice)
    const email = `fr-${alice.userId}@example.com`
    await db
      .insert(userSettings)
      .values({ email, version: 1, language: 'fr-FR' })
    const mailbox = aMailbox()

    await invite(alice, boardId, email, 'editor')
    await mailbox.deliver()

    const sent = mailbox.sent.filter(mail => mail.text.includes(boardId))
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe('Alice Martin partage « Roadmap » avec vous')
    expect(sent[0]?.text).toContain(
      "Alice Martin partage le tableau « Roadmap » avec vous, en tant qu'éditeur. Il appartient au projet « "
    )
    expect(sent[0]?.text).toContain(
      'dont vous pouvez maintenant ouvrir les tableaux.'
    )
  })

  it('sends nothing for an invite canceled before delivery', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()
    await invite(alice, boardId, 'gone@example.com', 'editor')
    const { invites } = (
      await api.as(alice).get(`/boards/${boardId}/sharing`)
    ).json<{ invites: { id: string }[] }>()

    await api
      .as(alice)
      .delete(`/boards/${boardId}/invites/${invites[0]?.id ?? ''}`)
    await mailbox.deliver()

    expect(mailbox.sent.filter(mail => mail.text.includes(boardId))).toEqual([])
  })

  it('sends nothing for an invite claimed before delivery', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()
    await invite(alice, boardId, bob.email, 'editor')

    await api.as(bob).get('/boards')
    await mailbox.deliver()

    expect(mailbox.sent.filter(mail => mail.text.includes(boardId))).toEqual([])
  })

  it('schedules nothing for an invite the server refuses', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const boardId = await aSharedBoard(alice)
    await joinBoard(db, alice, boardId, bob, 'editor')

    const response = await invite(bob, boardId, 'refused@example.com', 'viewer')

    expect(response.statusCode).toBe(403)
    expect(
      await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          like(jobs.key, `${PROJECT_INVITE_EMAIL_JOB}:%:refused@example.com`)
        )
    ).toEqual([])
  })

  it('names the project and flattens line breaks in names', async () => {
    const alice = aUser({ name: 'Eve\n\nClick here\u202e' })
    const boardId = await aSharedBoard(alice)
    // The API refuses such a name now, but a board created before still holds it
    await inTenant(db, alice, tx =>
      tx
        .update(boards)
        .set({ name: 'Plan\r\nFake: line' })
        .where(eq(boards.id, boardId))
    )
    const mailbox = aMailbox()

    await invite(alice, boardId, 'inject@example.com', 'viewer')
    await mailbox.deliver()

    const sent = mailbox.sent.filter(mail => mail.text.includes(boardId))
    expect(sent[0]?.subject).toBe(
      'Eve Click here shared "Plan Fake: line" with you'
    )
    expect(sent[0]?.text.split('\n')[0]).toContain(
      'Eve Click here shared the board "Plan Fake: line"'
    )
  })

  it('sends one e-mail a day per address and project, whatever the role or cancel', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()
    await invite(alice, boardId, 'spam@example.com', 'viewer')
    await mailbox.deliver()

    await invite(alice, boardId, 'spam@example.com', 'admin')
    const { invites } = (
      await api.as(alice).get(`/boards/${boardId}/sharing`)
    ).json<{ invites: { id: string }[] }>()
    await api
      .as(alice)
      .delete(`/boards/${boardId}/invites/${invites[0]?.id ?? ''}`)
    await invite(alice, boardId, 'spam@example.com', 'editor')
    await mailbox.deliver()

    expect(
      mailbox.sent.filter(mail => mail.text.includes(boardId))
    ).toHaveLength(1)
    expect(
      (await api.as(alice).get(`/boards/${boardId}/sharing`)).json<{
        invites: { role: string }[]
      }>().invites
    ).toMatchObject([{ role: 'editor' }])
  })

  it('sends at most 20 e-mails an hour per inviter', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()

    for (let n = 0; n <= EMAILS_PER_INVITER; n++) {
      await invite(alice, boardId, `bulk-${String(n)}@example.com`, 'viewer')
    }
    await mailbox.deliver()

    expect(
      mailbox.sent.filter(mail => mail.text.includes(boardId))
    ).toHaveLength(EMAILS_PER_INVITER)
    expect(
      (await api.as(alice).get(`/boards/${boardId}/sharing`)).json<{
        invites: unknown[]
      }>().invites
    ).toHaveLength(EMAILS_PER_INVITER + 1)
  })

  it('counts an address once whatever its case', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()
    await invite(alice, boardId, 'someone@example.com', 'viewer')
    await mailbox.deliver()

    await invite(alice, boardId, 'Someone@Example.com', 'editor')
    await mailbox.deliver()

    expect(
      mailbox.sent.filter(mail => mail.text.includes(boardId))
    ).toHaveLength(1)
  })

  it('forgets an e-mail sent more than a day ago', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    await recordEmails(alice, boardId, ['old@example.com'], 25 * 60)
    const mailbox = aMailbox()

    await invite(alice, boardId, 'old@example.com', 'viewer')
    await mailbox.deliver()

    expect(
      mailbox.sent.filter(mail => mail.text.includes(boardId))
    ).toHaveLength(1)
  })

  it('does not count an hourly e-mail sent 61 minutes ago', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    await recordEmails(
      alice,
      boardId,
      Array.from(
        { length: EMAILS_PER_INVITER },
        (_, n) => `past-${String(n)}@example.com`
      ),
      61
    )
    const mailbox = aMailbox()

    await invite(alice, boardId, 'now@example.com', 'viewer')
    await mailbox.deliver()

    expect(
      mailbox.sent.filter(mail => mail.text.includes(boardId))
    ).toHaveLength(1)
  })

  it('counts an hourly e-mail sent 59 minutes ago', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    await recordEmails(
      alice,
      boardId,
      Array.from(
        { length: EMAILS_PER_INVITER },
        (_, n) => `recent-${String(n)}@example.com`
      ),
      59
    )
    const mailbox = aMailbox()

    await invite(alice, boardId, 'now@example.com', 'viewer')
    await mailbox.deliver()

    expect(mailbox.sent.filter(mail => mail.text.includes(boardId))).toEqual([])
  })

  it('holds the ceiling when the invites come in parallel', async () => {
    const alice = aUser()
    const boardId = await aSharedBoard(alice)
    const mailbox = aMailbox()

    await Promise.all(
      Array.from({ length: 2 * EMAILS_PER_INVITER }, (_, n) =>
        invite(alice, boardId, `par-${String(n)}@example.com`, 'viewer')
      )
    )
    await mailbox.deliver()

    expect(
      mailbox.sent.filter(mail => mail.text.includes(boardId))
    ).toHaveLength(EMAILS_PER_INVITER)
  })
})

async function recordEmails(
  inviter: TestUser,
  boardId: string,
  addresses: string[],
  minutesAgo: number
) {
  await inTenant(db, inviter, async tx => {
    const [board] = await tx
      .select({ projectId: boards.projectId })
      .from(boards)
      .where(eq(boards.id, boardId))
    if (!board) throw new Error('no board')
    await tx.insert(inviteEmails).values(
      addresses.map(email => ({
        projectId: board.projectId,
        organizationId: inviter.organizationId,
        email,
        invitedBy: inviter.userId,
        sentAt: new Date(Date.now() - minutesAgo * 60_000)
      }))
    )
  })
}
