import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

interface Template {
  id: string
  projectId: string | null
  title: string
  description: string
  priority: number | null
  labelIds: string[]
  assigneeIds: string[]
}

interface Board {
  id: string
  sections: { id: string; name: string }[]
  tasks: {
    id: string
    title: string
    sectionId: string | null
    template: { id: string; title: string | null } | null
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

const own = {
  title: 'Close the monthly report',
  description: 'Check the **invoices**',
  priority: 2
}

const fields = { ...own, labelIds: [], assigneeIds: [] }

async function aBoard(user: TestUser, keyPrefix = 'FIN', projectId?: string) {
  const as = api.as(user)
  const { id, project } = (
    await as.post('/boards', { name: 'Finance', keyPrefix, projectId })
  ).json<{ id: string; project: { id: string } }>()
  return {
    id,
    projectId: project.id,
    load: async () => (await as.get(`/boards/${id}`)).json<Board>(),
    addTemplate: (body: object = {}) =>
      as.post(`/projects/${project.id}/templates`, { ...fields, ...body }),
    addLabel: async (name: string) =>
      (await as.post(`/boards/${id}/labels`, { name })).json<{ id: string }>(),
    use: (
      templateId: string,
      by: TestUser = user,
      sectionId: string | null = null
    ) =>
      api
        .as(by)
        .post(`/boards/${id}/tasks`, { sectionId, title: 'Report', templateId })
  }
}

const templatesOf = async (user: TestUser) =>
  (await api.as(user).get('/templates')).json<{ templates: Template[] }>()
    .templates

describe('project templates', () => {
  it('serve every board of the project, and link the tasks made from them', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    const sibling = await aBoard(alice, 'OPS', board.projectId)
    await joinBoard(db, alice, board.id, bob, 'editor')
    const label = await board.addLabel('Monthly')
    const created = await board.addTemplate({
      labelIds: [label.id],
      assigneeIds: [bob.userId]
    })
    const template = created.json<Template>()
    const [, doing] = (await sibling.load()).sections

    const used = await sibling.use(template.id, bob, doing?.id ?? null)

    expect(created.statusCode).toBe(201)
    expect(template).toMatchObject({
      projectId: board.projectId,
      labelIds: [label.id],
      assigneeIds: [bob.userId]
    })
    expect(await templatesOf(bob)).toEqual([template])
    expect(used.json()).toMatchObject({ key: 'OPS-1', sectionId: doing?.id })
    expect((await sibling.load()).tasks).toMatchObject([
      { template: { id: template.id, title: 'Close the monthly report' } }
    ])
  })

  it('refuses a template of another project', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const other = await aBoard(alice, 'OPS')
    const template = (await other.addTemplate()).json<Template>()

    const used = await board.use(template.id)

    expect(used.json()).toEqual({ error: 'invalid_template' })
  })

  it('refuses labels of another project and people outside it', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const other = await aBoard(alice, 'OPS')
    const foreign = await other.addLabel('Elsewhere')

    const withLabel = await board.addTemplate({ labelIds: [foreign.id] })
    const withStranger = await board.addTemplate({
      assigneeIds: [aUser().userId]
    })

    expect(withLabel.json()).toEqual({ error: 'invalid_label' })
    expect(withStranger.json()).toEqual({ error: 'invalid_assignee' })
    expect(await templatesOf(alice)).toEqual([])
  })

  it('shows to a viewer, who cannot use them', async () => {
    const alice = aUser()
    const viola = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    const template = (await board.addTemplate()).json<Template>()
    await joinBoard(db, alice, board.id, viola, 'viewer')

    const used = await board.use(template.id, viola)

    expect(await templatesOf(viola)).toEqual([template])
    expect(used.statusCode).toBe(403)
  })

  it('edits and deletes a template, keeping the tasks it made', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const template = (await board.addTemplate()).json<Template>()
    await board.use(template.id)
    const as = api.as(alice)
    const url = `/projects/${board.projectId}/templates/${template.id}`

    const edited = await as.put(url, { ...fields, title: 'Close the books' })
    const deleted = await as.delete(url)

    expect(edited.json()).toMatchObject({ title: 'Close the books' })
    expect(deleted.statusCode).toBe(204)
    expect(await templatesOf(alice)).toEqual([])
    expect((await board.load()).tasks).toMatchObject([{ template: null }])
  })

  it('takes someone who leaves the project off its templates', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    await joinBoard(db, alice, board.id, bob, 'editor')
    await board.addTemplate({ assigneeIds: [bob.userId] })

    await api.as(alice).delete(`/boards/${board.id}/members/${bob.userId}`)

    expect(await templatesOf(alice)).toMatchObject([{ assigneeIds: [] }])
    expect(await templatesOf(bob)).toEqual([])
  })

  it('unlinks a task that moves to another project, not to a board of the same one', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const sibling = await aBoard(alice, 'OPS', board.projectId)
    const other = await aBoard(alice, 'ELS')
    const template = (await board.addTemplate()).json<Template>()
    const transfer = async (from: string, to: string) => {
      const [task] = (await api.as(alice).get(`/boards/${from}`)).json<Board>()
        .tasks
      await api
        .as(alice)
        .post(`/boards/${from}/tasks/${task?.id ?? ''}/transfer`, {
          boardId: to,
          sectionId: null
        })
    }
    await board.use(template.id)

    await transfer(board.id, sibling.id)
    const kept = (await sibling.load()).tasks
    await transfer(sibling.id, other.id)

    expect(kept).toMatchObject([{ template: { id: template.id } }])
    expect((await other.load()).tasks).toMatchObject([{ template: null }])
  })

  it('unlinks the tasks of a board that moves to another project', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    await aBoard(alice, 'OPS', board.projectId)
    const target = await aBoard(alice, 'ELS')
    const template = (await board.addTemplate()).json<Template>()
    await board.use(template.id)

    await api
      .as(alice)
      .post(`/boards/${board.id}/move`, { projectId: target.projectId })

    expect((await board.load()).tasks).toMatchObject([{ template: null }])
    expect(await templatesOf(alice)).toEqual([template])
  })

  it('refuses a recurrence on a task a template made', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const template = (await board.addTemplate()).json<Template>()
    const task = (await board.use(template.id)).json<{ id: string }>()

    const edited = await api
      .as(alice)
      .patch(`/boards/${board.id}/tasks/${task.id}`, {
        dueDate: '2026-11-05',
        recurrence: { every: 1, unit: 'months', fromCompletion: false }
      })

    expect(edited.json()).toEqual({ error: 'invalid_dates' })
  })
})

describe('personal templates', () => {
  it('serve every board their owner adds tasks to, and stay private', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    const other = await aBoard(alice, 'OPS')
    await joinBoard(db, alice, board.id, bob, 'editor')
    const created = await api.as(alice).post('/templates', own)
    const template = created.json<Template>()

    await board.use(template.id)
    await other.use(template.id)
    const byBob = await board.use(template.id, bob)

    expect(created.statusCode).toBe(201)
    expect(template).toMatchObject({ projectId: null, labelIds: [] })
    expect(await templatesOf(alice)).toEqual([template])
    expect(await templatesOf(bob)).toEqual([])
    expect(byBob.json()).toEqual({ error: 'invalid_template' })
    expect(
      (await api.as(bob).get(`/boards/${board.id}`)).json<Board>().tasks
    ).toMatchObject([{ template: { id: template.id, title: null } }])
    expect((await other.load()).tasks).toMatchObject([
      { template: { id: template.id, title: own.title } }
    ])
  })

  it('hold no labels or assignees, which belong to a project', async () => {
    const alice = aUser()

    const refused = await api.as(alice).post('/templates', fields)

    expect(refused.statusCode).toBe(400)
  })

  it('are edited and deleted by their owner alone', async () => {
    const alice = aUser()
    const mallory = aUser({ organizationId: alice.organizationId })
    const template = (
      await api.as(alice).post('/templates', own)
    ).json<Template>()
    const url = `/templates/${template.id}`

    const edited = await api.as(mallory).put(url, { ...own, title: 'Mine' })
    const deleted = await api.as(mallory).delete(url)
    const renamed = await api.as(alice).put(url, { ...own, title: 'Books' })

    expect(edited.statusCode).toBe(404)
    expect(deleted.statusCode).toBe(404)
    expect(renamed.json()).toMatchObject({ title: 'Books' })
  })

  it('are not reached through a project route', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const template = (
      await api.as(alice).post('/templates', own)
    ).json<Template>()

    const deleted = await api
      .as(alice)
      .delete(`/projects/${board.projectId}/templates/${template.id}`)

    expect(deleted.statusCode).toBe(404)
    expect(await templatesOf(alice)).toEqual([template])
  })
})
