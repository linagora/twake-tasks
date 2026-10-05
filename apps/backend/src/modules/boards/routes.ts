import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { createBoardStore, INBOX_KEY_PREFIX } from './store.ts'
import { createTaskStore, type Refusal } from './tasks.ts'

const newBoard = z.object({
  name: z.string().trim().min(1).max(100),
  keyPrefix: z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/)
})

const boardParams = z.object({ boardId: z.uuid() })

const newTask = z.object({
  sectionId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(500)
})

const taskParams = z.object({ boardId: z.uuid(), taskId: z.uuid() })

const taskMove = z.object({
  sectionId: z.uuid().nullable(),
  afterId: z.uuid().optional(),
  beforeId: z.uuid().optional()
})

const taskChanges = z
  .object({
    title: z.string().trim().min(1).max(500),
    priority: z.int().min(1).max(4).nullable(),
    dueDate: z.iso.date().nullable()
  })
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

const REFUSAL_STATUS: Record<Refusal, number> = {
  not_found: 404,
  forbidden: 403,
  archived: 409,
  invalid_section: 400,
  stale_neighbours: 409
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
}
