import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { createCommentStore } from './comments.ts'
import { createLabelStore } from './labels.ts'
import { sectionCategory } from './schema.ts'
import { createSectionStore } from './sections.ts'
import { createBoardStore, INBOX_KEY_PREFIX } from './store.ts'
import { createTaskStore, type Refusal } from './tasks.ts'

const newBoard = z.object({
  name: z.string().trim().min(1).max(100),
  keyPrefix: z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/)
})

const boardParams = z.object({ boardId: z.uuid() })

const taskTitle = z.string().trim().min(1).max(500)

const newTask = z.union([
  z.strictObject({ sectionId: z.uuid().nullable(), title: taskTitle }),
  z.strictObject({ parentId: z.uuid(), title: taskTitle })
])

const completion = z.object({
  state: z.enum(['completed', 'canceled']).nullable()
})

const taskParams = z.object({ boardId: z.uuid(), taskId: z.uuid() })

const taskMove = z.object({
  sectionId: z.uuid().nullable(),
  afterId: z.uuid().optional(),
  beforeId: z.uuid().optional()
})

const taskChanges = z
  .object({
    title: taskTitle,
    priority: z.int().min(1).max(4).nullable(),
    dueDate: z.iso.date().nullable()
  })
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

const assignment = z.object({ userIds: z.array(z.uuid()).max(50) })

const newLabel = z.object({ name: z.string().trim().min(1).max(50) })

const labeling = z.object({ labelIds: z.array(z.uuid()).max(50) })

const newComment = z.object({ body: z.string().trim().min(1).max(10_000) })

const descriptionEdit = z.object({
  markdown: z.string().max(50_000),
  version: z.int().min(0)
})

const sectionName = z.string().trim().min(1).max(100)
const category = z.enum(sectionCategory.enumValues)

const newSection = z.object({
  name: sectionName,
  category,
  afterId: z.uuid().optional()
})

const sectionParams = z.object({ boardId: z.uuid(), sectionId: z.uuid() })

const sectionChanges = z
  .object({ name: sectionName, category })
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

const sectionMove = z.object({
  afterId: z.uuid().optional(),
  beforeId: z.uuid().optional()
})

const sectionDeletion = z.object({ tasksTo: z.uuid().nullable().optional() })

const REFUSAL_STATUS: Record<Refusal, number> = {
  not_found: 404,
  forbidden: 403,
  archived: 409,
  invalid_section: 400,
  stale_neighbours: 409,
  section_not_empty: 409,
  invalid_assignee: 400,
  stale_version: 409,
  invalid_parent: 400,
  too_deep: 400,
  invalid_label: 400,
  label_taken: 409
}

function refuse(reply: FastifyReply, error: Refusal) {
  return reply.code(REFUSAL_STATUS[error]).send({ error })
}

export function registerBoards(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
) {
  const store = createBoardStore(deps.db)
  const taskStore = createTaskStore(deps.db)
  const sectionStore = createSectionStore(deps.db)
  const labelStore = createLabelStore(deps.db)
  const commentStore = createCommentStore(deps.db)

  app.get(
    '/boards',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      return { boards: await store.listBoards(identity) }
    }
  )

  app.get(
    '/boards/:boardId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      const board =
        params.success && (await store.getBoard(identity, params.data.boardId))
      if (!board) return reply.code(404).send({ error: 'not_found' })
      return board
    }
  )

  app.post(
    '/boards',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const body = newBoard.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const board =
        body.data.keyPrefix !== INBOX_KEY_PREFIX &&
        (await store.createUserBoard(identity, body.data))
      if (!board) return reply.code(409).send({ error: 'key_prefix_taken' })
      return reply.code(201).send(board)
    }
  )

  for (const [method, favorite] of [
    ['PUT', true],
    ['DELETE', false]
  ] as const) {
    app.route({
      method,
      url: '/boards/:boardId/favorite',
      preHandler: deps.requireIdentity,
      handler: async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = boardParams.safeParse(request.params)
        const found =
          params.success &&
          (await store.setFavorite(identity, params.data.boardId, favorite))
        if (!found) return reply.code(404).send({ error: 'not_found' })
        return reply.code(204).send()
      }
    })
  }

  app.post(
    '/boards/:boardId/tasks',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = newTask.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await taskStore.createTask(
        identity,
        params.data.boardId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.post(
    '/boards/:boardId/tasks/:taskId/move',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = taskMove.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await taskStore.moveTask(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.post(
    '/boards/:boardId/tasks/:taskId/complete',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = completion.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await taskStore.completeTask(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data.state
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.patch(
    '/boards/:boardId/tasks/:taskId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = taskChanges.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await taskStore.editTask(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.put(
    '/boards/:boardId/tasks/:taskId/assignees',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = assignment.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await taskStore.setAssignees(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data.userIds
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.post(
    '/boards/:boardId/labels',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = newLabel.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await labelStore.createLabel(
        identity,
        params.data.boardId,
        body.data.name
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.put(
    '/boards/:boardId/tasks/:taskId/labels',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = labeling.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await labelStore.setLabels(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data.labelIds
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.get(
    '/boards/:boardId/tasks/:taskId/comments',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await commentStore.listComments(
        identity,
        params.data.boardId,
        params.data.taskId
      )
      if (!result.ok) return refuse(reply, result.error)
      return { comments: result.value }
    }
  )

  app.post(
    '/boards/:boardId/tasks/:taskId/comments',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = newComment.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await commentStore.addComment(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data.body
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.get(
    '/boards/:boardId/tasks/:taskId/description',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await taskStore.getDescription(
        identity,
        params.data.boardId,
        params.data.taskId
      )
      if (!result.ok) return refuse(reply, result.error)
      return result.value
    }
  )

  app.put(
    '/boards/:boardId/tasks/:taskId/description',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = descriptionEdit.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await taskStore.setDescription(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return result.value
    }
  )

  app.post(
    '/boards/:boardId/sections',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = newSection.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sectionStore.createSection(
        identity,
        params.data.boardId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.patch(
    '/boards/:boardId/sections/:sectionId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = sectionParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = sectionChanges.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sectionStore.editSection(
        identity,
        params.data.boardId,
        params.data.sectionId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.post(
    '/boards/:boardId/sections/:sectionId/move',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = sectionParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = sectionMove.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sectionStore.moveSection(
        identity,
        params.data.boardId,
        params.data.sectionId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.delete(
    '/boards/:boardId/sections/:sectionId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = sectionParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = sectionDeletion.safeParse(request.body ?? {})
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sectionStore.deleteSection(
        identity,
        params.data.boardId,
        params.data.sectionId,
        body.data.tasksTo
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )
}
