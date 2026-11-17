import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { anIdentity } from '../auth/testing.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'
import { createViewStore } from './store.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

let statements = 0
const views = createViewStore(
  drizzle({
    client: sql,
    logger: {
      logQuery: () => {
        statements += 1
      }
    }
  })
)

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function statementsFor(user: TestUser) {
  statements = 0
  await views.assignedTasks(
    anIdentity({ ...user, subject: user.email, name: null })
  )
  return statements
}

// A task assigned to the people, labeled, commented, made from a template of
// the project and blocked by another task of the board.
async function aBoardOf(
  owner: TestUser,
  keyPrefix: string,
  people: TestUser[],
  projectId?: string
) {
  const as = api.as(owner)
  const board = (
    await as.post('/boards', { name: keyPrefix, keyPrefix, projectId })
  ).json<{ id: string; project: { id: string } }>()
  const at = `/boards/${board.id}/tasks`
  const blocker = (
    await as.post(at, { sectionId: null, title: `${keyPrefix} blocker` })
  ).json<{ id: string }>()
  const template = (
    await as.post(`/projects/${board.project.id}/templates`, {
      title: `${keyPrefix} template`,
      description: '',
      priority: null,
      labelIds: [],
      assigneeIds: []
    })
  ).json<{ id: string }>()
  const task = (
    await as.post(at, {
      sectionId: null,
      title: `${keyPrefix} task`,
      templateId: template.id
    })
  ).json<{ id: string }>()
  const label = (
    await as.post(`/boards/${board.id}/labels`, { name: `${keyPrefix} label` })
  ).json<{ id: string }>()
  for (const person of people) {
    if (person !== owner && projectId === undefined) {
      await joinBoard(db, owner, board.id, person, 'editor')
    }
  }
  await as.put(`${at}/${task.id}/assignees`, {
    userIds: people.map(person => person.userId)
  })
  await as.put(`${at}/${task.id}/labels`, { labelIds: [label.id] })
  await as.post(`${at}/${task.id}/comments`, { body: 'One' })
  await as.post(`${at}/${task.id}/comments`, { body: 'Two' })
  await as.post(`${at}/${task.id}/links`, {
    kind: 'blockedBy',
    taskId: blocker.id
  })
  return {
    boardId: board.id,
    projectId: board.project.id,
    templateId: template.id,
    labelId: label.id
  }
}

const byEmail = (people: TestUser[]) =>
  people
    .map(person => ({ userId: person.userId, email: person.email }))
    .sort((one, other) => one.email.localeCompare(other.email))

describe('my tasks', () => {
  it('costs as many statements over boards of several projects as over one board', async () => {
    const alone = aUser()
    await aBoardOf(alone, 'ONE', [alone])
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const design = await aBoardOf(alice, 'DES', [alice, bob])
    await aBoardOf(alice, 'OPS', [alice, bob], design.projectId)
    await aBoardOf(alice, 'HOM', [alice])
    await aBoardOf(alice, 'FIN', [alice])

    expect(await statementsFor(alice)).toBe(await statementsFor(alone))
  })

  it('describes the tasks of each board with its own project', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const design = await aBoardOf(alice, 'DES', [alice, bob])
    const ops = await aBoardOf(alice, 'OPS', [alice, bob], design.projectId)
    const home = await aBoardOf(alice, 'HOM', [alice])

    const response = await api.as(alice).get('/my-tasks')

    const described = (board: typeof design, keyPrefix: string) => ({
      key: `${keyPrefix}-2`,
      title: `${keyPrefix} task`,
      boardId: board.boardId,
      boardName: keyPrefix,
      projectId: board.projectId,
      template: { id: board.templateId, title: `${keyPrefix} template` },
      labels: [{ id: board.labelId, name: `${keyPrefix} label`, color: null }],
      commentCount: 2,
      blockers: [{ key: `${keyPrefix}-1`, title: `${keyPrefix} blocker` }]
    })
    expect(response.json<{ tasks: unknown[] }>().tasks).toMatchObject([
      { ...described(design, 'DES'), assignees: byEmail([alice, bob]) },
      { ...described(home, 'HOM'), assignees: byEmail([alice]) },
      { ...described(ops, 'OPS'), assignees: byEmail([alice, bob]) }
    ])
  })
})
