import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { createArchiveStore } from './archive.ts'
import { createCommentStore } from './comments.ts'
import { createFilterStore } from './filters.ts'
import { historyOf } from './history.ts'
import { createLabelStore } from './labels.ts'
import { createLayoutStore } from './layouts.ts'
import { createSharingStore } from './sharing.ts'
import { createReminderStore } from './reminders.ts'
import {
  durationUnit,
  LAYOUTS,
  memberRole,
  recurrenceUnit,
  sectionCategory
} from './schema.ts'
import { createSectionStore } from './sections.ts'
import { createBoardStore, INBOX_KEY_PREFIX } from './store.ts'
import { createTaskStore, type Refusal } from './tasks.ts'
import { createTransferStore } from './transfer.ts'

const newBoard = z.object({
  name: z.string().trim().min(1).max(100),
  keyPrefix: z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/),
  projectId: z.uuid().optional()
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

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const layoutChoice = z.object({ layout: z.enum(LAYOUTS) })

const role = z.enum(memberRole.enumValues)

const newInvite = z.object({
  email: z.email().max(254).toLowerCase(),
  role
})

const inviteParams = boardParams.extend({ inviteId: z.uuid() })

const memberParams = boardParams.extend({ userId: z.uuid() })

const searchQuery = z.object({ q: z.string().trim().min(1).max(200) })

const agendaQuery = z.object({
  zone: z.string().max(64).refine(isTimeZone),
  days: z.coerce.number().int().min(1).max(60)
})

const newFilter = z.object({
  name: z.string().trim().min(1).max(100),
  criteria: z.strictObject({
    assignee: z.enum(['me', 'nobody']).optional(),
    priority: z.int().min(1).max(4).optional(),
    label: z.string().trim().min(1).max(50).optional(),
    due: z.enum(['overdue', 'today', 'week', 'none']).optional()
  })
})

const filterParams = z.object({ filterId: z.uuid() })

const zoneQuery = z.object({ zone: z.string().max(64).refine(isTimeZone) })

const taskChanges = z
  .object({
    title: taskTitle,
    priority: z.int().min(1).max(4).nullable(),
    dueDate: z.iso.date().nullable(),
    dueTime: z.iso.time({ precision: -1 }).nullable(),
    dueZone: z.string().max(64).refine(isTimeZone).nullable(),
    deadline: z.iso.date().nullable(),
    duration: z
      .object({
        amount: z.int().min(1).max(100_000),
        unit: z.enum(durationUnit.enumValues)
      })
      .nullable(),
    recurrence: z
      .object({
        every: z.int().min(1).max(1000),
        unit: z.enum(recurrenceUnit.enumValues),
        fromCompletion: z.boolean()
      })
      .nullable()
  })
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

const assignment = z.object({ userIds: z.array(z.uuid()).max(50) })

const newLabel = z.object({ name: z.string().trim().min(1).max(50) })

const labeling = z.object({ labelIds: z.array(z.uuid()).max(50) })

const newComment = z.object({ body: z.string().trim().min(1).max(10_000) })

const newReminder = z.union([
  z.strictObject({
    at: z.iso.datetime({ offset: true }).pipe(z.coerce.date())
  }),
  z.strictObject({
    beforeMinutes: z
      .int()
      .min(0)
      .max(60 * 24 * 365),
    zone: z.string().max(64).refine(isTimeZone)
  })
])

const reminderParams = taskParams.extend({ reminderId: z.uuid() })

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
  invalid_dates: 400,
  invalid_reminder: 400,
  label_taken: 409,
  last_admin: 409,
  key_prefix_taken: 409,
  same_board: 400
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
  const reminderStore = createReminderStore(deps.db)
  const filterStore = createFilterStore(deps.db)
  const layoutStore = createLayoutStore(deps.db)
  const sharingStore = createSharingStore(deps.db)
  const archiveStore = createArchiveStore(deps.db)
  const transferStore = createTransferStore(deps.db)

  app.post(
    '/boards/:boardId/invites',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = newInvite.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sharingStore.invite(
        identity,
        params.data.boardId,
        body.data.email,
        body.data.role
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(202).send({ status: 'invited' })
    }
  )

  app.get(
    '/boards/:boardId/sharing',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await sharingStore.sharing(identity, params.data.boardId)
      if (!result.ok) return refuse(reply, result.error)
      return result.value
    }
  )

  app.delete(
    '/boards/:boardId/invites/:inviteId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = inviteParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await sharingStore.cancelInvite(
        identity,
        params.data.boardId,
        params.data.inviteId
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.get(
    '/projects',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      return { projects: await sharingStore.myProjects(identity) }
    }
  )

  app.post(
    '/boards/:boardId/move',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = z.object({ projectId: z.uuid() }).safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sharingStore.moveToProject(
        identity,
        params.data.boardId,
        body.data.projectId
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  for (const [path, archived] of [
    ['archive', true],
    ['unarchive', false]
  ] as const) {
    app.post(
      `/boards/:boardId/${path}`,
      { preHandler: deps.requireIdentity },
      async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = boardParams.safeParse(request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const result = await archiveStore.setBoardArchived(
          identity,
          params.data.boardId,
          archived
        )
        if (!result.ok) return refuse(reply, result.error)
        return reply.code(204).send()
      }
    )
  }

  for (const [path, stamp] of [
    ['archived', 'archivedAt'],
    ['trash', 'deletedAt']
  ] as const) {
    app.get(
      `/boards/:boardId/${path}`,
      { preHandler: deps.requireIdentity },
      async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = boardParams.safeParse(request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const hidden = await archiveStore.hiddenTasks(
          identity,
          params.data.boardId,
          stamp
        )
        if (!hidden) return reply.code(404).send({ error: 'not_found' })
        return { tasks: hidden }
      }
    )
  }

  for (const [method, path, change] of [
    ['POST', '/archive', 'archiveTask'],
    ['POST', '/restore', 'restoreTask'],
    ['DELETE', '', 'trashTask']
  ] as const) {
    app.route({
      method,
      url: `/boards/:boardId/tasks/:taskId${path}`,
      preHandler: deps.requireIdentity,
      handler: async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = taskParams.safeParse(request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const result = await archiveStore[change](
          identity,
          params.data.boardId,
          params.data.taskId
        )
        if (!result.ok) return refuse(reply, result.error)
        return reply.code(204).send()
      }
    })
  }

  app.post(
    '/boards/:boardId/tasks/:taskId/transfer',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = z
        .object({ boardId: z.uuid(), sectionId: z.uuid().nullable() })
        .safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await transferStore.transferTask(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return result.value
    }
  )

  app.put(
    '/boards/:boardId/members/:userId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = memberParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = z.object({ role }).safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sharingStore.setRole(
        identity,
        params.data.boardId,
        params.data.userId,
        body.data.role
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.delete(
    '/boards/:boardId/members/:userId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = memberParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await sharingStore.removeMember(
        identity,
        params.data.boardId,
        params.data.userId
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.get(
    '/filters',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await filterStore.listFilters(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { filters: result.value }
    }
  )

  app.get(
    '/labels',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await filterStore.labelNames(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { labels: result.value }
    }
  )

  app.post(
    '/filters',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const body = newFilter.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await filterStore.createFilter(
        identity,
        body.data.name,
        body.data.criteria
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.delete(
    '/filters/:filterId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = filterParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await filterStore.deleteFilter(
        identity,
        params.data.filterId
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.get(
    '/filters/:filterId/tasks',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = filterParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const query = zoneQuery.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await filterStore.filteredTasks(
        identity,
        params.data.filterId,
        query.data.zone
      )
      if (!result.ok) return refuse(reply, result.error)
      return { tasks: result.value }
    }
  )

  app.get(
    '/boards/:boardId/tasks/:taskId/reminders',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await reminderStore.listReminders(
        identity,
        params.data.boardId,
        params.data.taskId
      )
      if (!result.ok) return refuse(reply, result.error)
      return { reminders: result.value }
    }
  )

  app.post(
    '/boards/:boardId/tasks/:taskId/reminders',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = newReminder.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await reminderStore.addReminder(
        identity,
        params.data.boardId,
        params.data.taskId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.delete(
    '/boards/:boardId/tasks/:taskId/reminders/:reminderId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = reminderParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await reminderStore.deleteReminder(
        identity,
        params.data.boardId,
        params.data.taskId,
        params.data.reminderId
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.get(
    '/boards/:boardId/tasks/:taskId/follow',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await reminderStore.following(
        identity,
        params.data.boardId,
        params.data.taskId
      )
      if (!result.ok) return refuse(reply, result.error)
      return { following: result.value }
    }
  )

  for (const [method, following] of [
    ['PUT', true],
    ['DELETE', false]
  ] as const) {
    app.route({
      method,
      url: '/boards/:boardId/tasks/:taskId/follow',
      preHandler: deps.requireIdentity,
      handler: async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = taskParams.safeParse(request.params)
        if (!params.success) {
          return reply.code(404).send({ error: 'not_found' })
        }
        const result = await reminderStore.setFollowing(
          identity,
          params.data.boardId,
          params.data.taskId,
          following
        )
        if (!result.ok) return refuse(reply, result.error)
        return reply.code(204).send()
      }
    })
  }

  app.post(
    '/notifications/read',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await reminderStore.markAllRead(identity)
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.get(
    '/notifications/unread',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await reminderStore.unreadByProject(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { projects: result.value }
    }
  )

  app.get(
    '/notifications',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await reminderStore.notificationsOf(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { notifications: result.value }
    }
  )

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
    '/search',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const query = searchQuery.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      return { tasks: await store.search(identity, query.data.q) }
    }
  )

  app.get(
    '/my-tasks',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      return { tasks: await store.assignedTasks(identity) }
    }
  )

  app.get(
    '/agenda',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const query = agendaQuery.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      return store.agenda(identity, query.data.zone, query.data.days)
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
      if (body.data.keyPrefix === INBOX_KEY_PREFIX) {
        return refuse(reply, 'key_prefix_taken')
      }
      const result = await store.createBoard(identity, body.data)
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
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

  for (const [url, set] of [
    ['/boards/:boardId/layout', 'setLayout'],
    ['/boards/:boardId/default-layout', 'setDefaultLayout']
  ] as const) {
    app.put(
      url,
      { preHandler: deps.requireIdentity },
      async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = boardParams.safeParse(request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const body = layoutChoice.safeParse(request.body)
        if (!body.success) {
          return reply.code(400).send({ error: 'invalid_request' })
        }
        const result = await layoutStore[set](
          identity,
          params.data.boardId,
          body.data.layout
        )
        if (!result.ok) return refuse(reply, result.error)
        return reply.code(204).send()
      }
    )
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
    '/boards/:boardId/tasks/:taskId/history',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await historyOf(
        deps.db,
        identity,
        params.data.boardId,
        params.data.taskId
      )
      if (!result.ok) return refuse(reply, result.error)
      return { entries: result.value }
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
