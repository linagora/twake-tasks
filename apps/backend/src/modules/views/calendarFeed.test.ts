import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'
import { calendarOf } from './icalendar.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function aBoardOf(owner: TestUser, keyPrefix: string) {
  const board = (
    await api.as(owner).post('/boards', { name: keyPrefix, keyPrefix })
  ).json<{ id: string }>()
  const add = async (
    title: string,
    changes: object,
    assignees: TestUser[] = [owner]
  ) => {
    const task = (
      await api
        .as(owner)
        .post(`/boards/${board.id}/tasks`, { sectionId: null, title })
    ).json<{ id: string; key: string }>()
    await api.as(owner).patch(`/boards/${board.id}/tasks/${task.id}`, changes)
    await api.as(owner).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
      userIds: assignees.map(each => each.userId)
    })
    return task
  }
  return { boardId: board.id, add }
}

async function openFeed(user: TestUser, scope = 'assigned') {
  const response = await api.as(user).post('/calendar-feed', { scope })
  expect(response.statusCode).toBe(201)
  return response.json<{ token: string }>().token
}

const fetchFeed = (token: string) =>
  api.inject({ method: 'GET', url: `/api/calendar/${token}.ics` })

const summaries = (calendar: string) =>
  [...calendar.matchAll(/^SUMMARY:(.*)$/gm)].map(match => match[1]?.trim())

describe('the calendar feed', () => {
  it('shows the open tasks assigned to the person on their due dates', async () => {
    const bob = aUser()
    const board = await aBoardOf(bob, 'CAL')
    const call = await board.add('Call the printer', {
      dueDate: '2026-11-04',
      dueTime: '15:00',
      dueZone: 'Europe/Paris'
    })
    await board.add('Send the invoices', {
      dueDate: '2026-11-05',
      duration: { amount: 2, unit: 'days' }
    })
    await board.add('Weekly review', {
      dueDate: '2026-11-06',
      recurrence: { every: 1, unit: 'weeks', fromCompletion: false }
    })
    const done = await board.add('Already done', { dueDate: '2026-11-04' })
    await board.add('Undated', { priority: 1 })
    await api
      .as(bob)
      .post(`/boards/${board.boardId}/tasks/${done.id}/complete`, {
        state: 'completed'
      })

    const response = await fetchFeed(await openFeed(bob))

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe(
      'text/calendar; charset=utf-8'
    )
    const calendar = response.body.replace(/\r\n /g, '')
    expect(summaries(calendar)).toEqual([
      'CAL-1 Call the printer',
      'CAL-2 Send the invoices',
      'CAL-3 Weekly review'
    ])
    expect(calendar).toContain(
      'DTSTART;TZID=Europe/Paris:20261104T150000\r\nDURATION:PT30M'
    )
    expect(calendar).toContain(
      'DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261107'
    )
    expect(calendar).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1')
    expect(calendar).toContain(
      `URL:https://tasks.example.com/boards/${board.boardId}?task=${call.key}`
    )
  })

  it('adds the unassigned tasks of the person’s projects when asked', async () => {
    const bob = aUser()
    const board = await aBoardOf(bob, 'ALL')
    await board.add('Nobody yet', { dueDate: '2026-11-04' }, [])
    const token = await openFeed(bob)

    expect(summaries((await fetchFeed(token)).body)).toEqual([])

    await api.as(bob).patch('/calendar-feed', { scope: 'mine' })

    expect(summaries((await fetchFeed(token)).body)).toEqual([
      'ALL-1 Nobody yet'
    ])
  })

  it('ends the old link once reset, and every link once turned off', async () => {
    const bob = aUser()
    const old = await openFeed(bob)
    const fresh = await openFeed(bob)

    expect((await fetchFeed(old)).statusCode).toBe(404)
    expect((await fetchFeed(fresh)).statusCode).toBe(200)

    await api.as(bob).delete('/calendar-feed')

    expect((await fetchFeed(fresh)).statusCode).toBe(404)
    expect((await api.as(bob).get('/calendar-feed')).json()).toEqual({
      feed: null
    })
  })

  it('drops the tasks of a board the person left', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoardOf(alice, 'LFT')
    await joinBoard(db, alice, board.boardId, bob, 'editor')
    await board.add('Shared', { dueDate: '2026-11-04' }, [bob])
    const token = await openFeed(bob)

    expect(summaries((await fetchFeed(token)).body)).toEqual(['LFT-1 Shared'])

    await api.as(bob).delete(`/boards/${board.boardId}/members/${bob.userId}`)

    expect(summaries((await fetchFeed(token)).body)).toEqual([])
  })

  it('refuses a link fetched more often than calendars poll', async () => {
    const token = await openFeed(aUser())
    const statuses = []
    for (let fetch = 0; fetch < 21; fetch++) {
      statuses.push((await fetchFeed(token)).statusCode)
    }

    expect(statuses.slice(-2)).toEqual([200, 429])
  })

  it('keeps the token out of the request logs', async () => {
    const logs: string[] = []
    const logged = await startApp({
      logger: pino({ level: 'info' }, { write: line => logs.push(line) })
    })
    try {
      const response = await logged
        .as(aUser())
        .post('/calendar-feed', { scope: 'assigned' })
      const { token } = response.json<{ token: string }>()

      await logged.inject({ method: 'GET', url: `/api/calendar/${token}.ics` })

      expect(logs.some(line => line.includes('/api/calendar/'))).toBe(true)
      expect(logs.filter(line => line.includes(token))).toEqual([])
    } finally {
      await logged.close()
    }
  })

  it('answers 404 for a token nobody holds', async () => {
    expect((await fetchFeed('0'.repeat(64))).statusCode).toBe(404)
    expect((await fetchFeed('not-a-token')).statusCode).toBe(404)
  })
})

describe('calendarOf', () => {
  it('escapes text and folds long lines', () => {
    const calendar = calendarOf(
      [
        {
          id: 'task',
          key: 'CAL-1',
          title: `Plan; review, and ${'é'.repeat(60)}`,
          boardId: 'board',
          boardName: 'Design\rEND:VEVENT',
          priority: 2,
          dueDate: '2026-11-04',
          dueTime: null,
          dueZone: null,
          duration: null,
          recurrence: null,
          labels: [{ name: 'Urgent' }]
        }
      ],
      {
        appUrl: 'https://tasks.example.com/',
        name: 'Twake Project',
        now: new Date('2026-11-04T10:00:00Z')
      }
    )

    const lines = calendar.split('\r\n')
    expect(lines.every(line => Buffer.byteLength(line) <= 75)).toBe(true)
    expect(lines.some(line => /[\r\n]/.test(line))).toBe(false)
    const unfolded = calendar.replace(/\r\n /g, '')
    expect(unfolded).toContain(
      `SUMMARY:CAL-1 Plan\\; review\\, and ${'é'.repeat(60)}`
    )
    expect(unfolded).toContain(
      'DESCRIPTION:Design\\nEND:VEVENT\\nP2 · Urgent\\nhttps://tasks.example.com/boards/board?task=CAL-1'
    )
    expect(unfolded).toContain(
      'DTSTART;VALUE=DATE:20261104\r\nDTEND;VALUE=DATE:20261105'
    )
  })
})
