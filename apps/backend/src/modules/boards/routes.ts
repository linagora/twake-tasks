import {
  agendaQuery,
  assignment,
  boardMove,
  boardParams,
  boardRename,
  completion,
  descriptionEdit,
  filterChanges,
  filterParams,
  inviteParams,
  labelChanges,
  labeling,
  labelParams,
  layoutChoice,
  memberParams,
  newBoard,
  newComment,
  newFilter,
  newInvite,
  newLabel,
  newReminder,
  newSection,
  newTask,
  peopleQuery,
  reactionEmoji,
  reactionParams,
  reminderParams,
  roleChange,
  searchQuery,
  sectionChanges,
  sectionDeletion,
  sectionMove,
  sectionParams,
  taskChanges,
  taskMove,
  taskParams,
  transferTarget,
  zoneQuery
} from '@twake-tasks/api-contract'
import type * as wire from '@twake-tasks/api-contract'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { allowOrigins } from '../../infra/cors.ts'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import {
  defineRoute,
  registerRoutes,
  type DeclaredRoute
} from '../../infra/route.ts'
import type { Identity, RequireIdentity } from '../auth/index.ts'
import { createArchiveStore } from './archive.ts'
import { createCommentStore } from './comments.ts'
import { createFilterStore } from './filters.ts'
import { historyOf } from './history.ts'
import { createLabelStore } from './labels.ts'
import { createLayoutStore } from './layouts.ts'
import { createSharingStore } from './sharing.ts'
import { createReminderStore } from './reminders.ts'
import type * as db from './schema.ts'
import { createSectionStore } from './sections.ts'
import { createBoardStore, INBOX_KEY_PREFIX } from './store.ts'
import { createTaskStore, type Refusal, type Result } from './tasks.ts'
import { createTransferStore } from './transfer.ts'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
type Values<T extends readonly string[]> = T[number]

// The contract declares its own enums, so tsc fails here when they drift.
export type ContractMatchesBackend = [
  Assert<
    Same<
      Values<typeof wire.MEMBER_ROLES>,
      (typeof db.memberRole.enumValues)[number]
    >
  >,
  Assert<
    Same<
      Values<typeof wire.SECTION_CATEGORIES>,
      (typeof db.sectionCategory.enumValues)[number]
    >
  >,
  Assert<
    Same<
      Values<typeof wire.DURATION_UNITS>,
      (typeof db.durationUnit.enumValues)[number]
    >
  >,
  Assert<
    Same<
      Values<typeof wire.RECURRENCE_UNITS>,
      (typeof db.recurrenceUnit.enumValues)[number]
    >
  >,
  Assert<Same<Values<typeof wire.LAYOUTS>, Values<typeof db.LAYOUTS>>>,
  Assert<
    Same<
      Exclude<
        (typeof wire.REFUSALS)['options'][number],
        'invalid_request' | 'unavailable' | 'server_error'
      >,
      Refusal
    >
  >
]

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
  too_many_mentions: 400,
  too_many_reminders: 409,
  label_taken: 409,
  section_name_taken: 409,
  last_admin: 409,
  key_prefix_taken: 409,
  same_board: 400
}

type BoardRoute = DeclaredRoute<Identity, Refusal>

async function under<K extends string, T>(
  key: K,
  pending: Promise<Result<T>>
): Promise<Result<Record<K, T>>> {
  const result = await pending
  return result.ok
    ? { ok: true, value: { [key]: result.value } as Record<K, T> }
    : result
}

function refuse(reply: FastifyReply, error: Refusal) {
  return reply.code(REFUSAL_STATUS[error]).send({ error })
}

export function registerBoards(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    searchAllowedOrigins: readonly string[]
    searchMinLength: number
    // 0 for no cap.
    mentionsPerComment: number
    pendingReminders: number
  }
) {
  const store = createBoardStore(deps.db)
  const taskStore = createTaskStore(deps.db)
  const sectionStore = createSectionStore(deps.db)
  const labelStore = createLabelStore(deps.db)
  const commentStore = createCommentStore(deps.db, deps.mentionsPerComment)
  const reminderStore = createReminderStore(deps.db, deps.pendingReminders)
  const filterStore = createFilterStore(deps.db)
  const layoutStore = createLayoutStore(deps.db)
  const sharingStore = createSharingStore(deps.db)
  const archiveStore = createArchiveStore(deps.db)
  const transferStore = createTransferStore(deps.db)
  const routing = {
    requireIdentity: deps.requireIdentity,
    identify: (request: FastifyRequest) => request.identity,
    refusalStatus: REFUSAL_STATUS
  }

  registerRoutes(app, routing, [
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/invites',
      params: boardParams,
      body: newInvite,
      status: 202,
      handler: async ({ identity, params, body }) => {
        const result = await sharingStore.invite(
          identity,
          params.boardId,
          body.email,
          body.role
        )
        return result.ok ? { ok: true, value: { status: 'invited' } } : result
      }
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/sharing',
      params: boardParams,
      handler: ({ identity, params }) =>
        sharingStore.sharing(identity, params.boardId)
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/sharing/people',
      params: boardParams,
      query: peopleQuery,
      handler: ({ identity, params, query }) =>
        under(
          'people',
          sharingStore.suggestPeople(identity, params.boardId, query.q)
        )
    }),
    defineRoute({
      method: 'DELETE',
      url: '/boards/:boardId/invites/:inviteId',
      params: inviteParams,
      status: 204,
      handler: ({ identity, params }) =>
        sharingStore.cancelInvite(identity, params.boardId, params.inviteId)
    }),
    defineRoute({
      method: 'GET',
      url: '/projects',
      handler: async ({ identity }) => ({
        ok: true,
        value: { projects: await sharingStore.myProjects(identity) }
      })
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/move',
      params: boardParams,
      body: boardMove,
      status: 204,
      handler: ({ identity, params, body }) =>
        sharingStore.moveToProject(identity, params.boardId, body.projectId)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/members/:userId',
      params: memberParams,
      body: roleChange,
      status: 204,
      handler: ({ identity, params, body }) =>
        sharingStore.setRole(identity, params.boardId, params.userId, body.role)
    }),
    defineRoute({
      method: 'DELETE',
      url: '/boards/:boardId/members/:userId',
      params: memberParams,
      status: 204,
      handler: ({ identity, params }) =>
        sharingStore.removeMember(identity, params.boardId, params.userId)
    })
  ])

  registerRoutes(app, routing, [
    ...(
      [
        ['archive', true],
        ['unarchive', false]
      ] as const
    ).map(([path, archived]): BoardRoute =>
      defineRoute({
        method: 'POST',
        url: `/boards/:boardId/${path}`,
        params: boardParams,
        status: 204,
        handler: ({ identity, params }) =>
          archiveStore.setBoardArchived(identity, params.boardId, archived)
      })
    ),
    ...(
      [
        ['archived', 'archivedAt'],
        ['trash', 'deletedAt']
      ] as const
    ).map(([path, stamp]): BoardRoute =>
      defineRoute({
        method: 'GET',
        url: `/boards/:boardId/${path}`,
        params: boardParams,
        handler: async ({ identity, params }) => {
          const hidden = await archiveStore.hiddenTasks(
            identity,
            params.boardId,
            stamp
          )
          return hidden
            ? { ok: true, value: { tasks: hidden } }
            : { ok: false, error: 'not_found' }
        }
      })
    ),
    ...(
      [
        ['POST', '/archive', 'archiveTask'],
        ['POST', '/restore', 'restoreTask'],
        ['DELETE', '', 'trashTask']
      ] as const
    ).map(([method, path, change]): BoardRoute =>
      defineRoute({
        method,
        url: `/boards/:boardId/tasks/:taskId${path}`,
        params: taskParams,
        status: 204,
        handler: ({ identity, params }) =>
          archiveStore[change](identity, params.boardId, params.taskId)
      })
    ),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/transfer/preview',
      params: taskParams,
      body: transferTarget,
      handler: ({ identity, params, body }) =>
        transferStore.previewTransfer(
          identity,
          params.boardId,
          params.taskId,
          body
        )
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/transfer',
      params: taskParams,
      body: transferTarget,
      handler: ({ identity, params, body }) =>
        transferStore.transferTask(
          identity,
          params.boardId,
          params.taskId,
          body
        )
    })
  ])

  registerRoutes(app, routing, [
    defineRoute({
      method: 'GET',
      url: '/filters',
      handler: ({ identity }) =>
        under('filters', filterStore.listFilters(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/labels',
      handler: ({ identity }) =>
        under('labels', filterStore.labelNames(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/people',
      handler: ({ identity }) => under('people', filterStore.people(identity))
    }),
    defineRoute({
      method: 'POST',
      url: '/filters',
      body: newFilter,
      status: 201,
      handler: ({ identity, body }) =>
        filterStore.createFilter(identity, body.name, body.criteria)
    }),
    defineRoute({
      method: 'PATCH',
      url: '/filters/:filterId',
      params: filterParams,
      body: filterChanges,
      status: 204,
      handler: ({ identity, params, body }) =>
        filterStore.updateFilter(identity, params.filterId, body)
    }),
    defineRoute({
      method: 'DELETE',
      url: '/filters/:filterId',
      params: filterParams,
      status: 204,
      handler: ({ identity, params }) =>
        filterStore.deleteFilter(identity, params.filterId)
    }),
    ...(
      [
        ['PUT', true],
        ['DELETE', false]
      ] as const
    ).map(([method, favorite]): BoardRoute =>
      defineRoute({
        method,
        url: '/filters/:filterId/favorite',
        params: filterParams,
        status: 204,
        handler: ({ identity, params }) =>
          filterStore.updateFilter(identity, params.filterId, { favorite })
      })
    ),
    defineRoute({
      method: 'GET',
      url: '/filters/:filterId/tasks',
      params: filterParams,
      query: zoneQuery,
      handler: ({ identity, params, query }) =>
        under(
          'tasks',
          filterStore.filteredTasks(identity, params.filterId, query.zone)
        )
    })
  ])

  registerRoutes(app, routing, [
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/reminders',
      params: taskParams,
      handler: ({ identity, params }) =>
        under(
          'reminders',
          reminderStore.listReminders(identity, params.boardId, params.taskId)
        )
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/reminders',
      params: taskParams,
      body: newReminder,
      status: 201,
      handler: ({ identity, params, body }) =>
        reminderStore.addReminder(identity, params.boardId, params.taskId, body)
    }),
    defineRoute({
      method: 'DELETE',
      url: '/boards/:boardId/tasks/:taskId/reminders/:reminderId',
      params: reminderParams,
      status: 204,
      handler: ({ identity, params }) =>
        reminderStore.deleteReminder(
          identity,
          params.boardId,
          params.taskId,
          params.reminderId
        )
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/follow',
      params: taskParams,
      handler: ({ identity, params }) =>
        under(
          'following',
          reminderStore.following(identity, params.boardId, params.taskId)
        )
    }),
    ...(
      [
        ['PUT', true],
        ['DELETE', false]
      ] as const
    ).map(([method, following]): BoardRoute =>
      defineRoute({
        method,
        url: '/boards/:boardId/tasks/:taskId/follow',
        params: taskParams,
        status: 204,
        handler: ({ identity, params }) =>
          reminderStore.setFollowing(
            identity,
            params.boardId,
            params.taskId,
            following
          )
      })
    ),
    defineRoute({
      method: 'POST',
      url: '/notifications/read',
      status: 204,
      handler: ({ identity }) => reminderStore.markAllRead(identity)
    }),
    defineRoute({
      method: 'GET',
      url: '/notifications/unread',
      handler: ({ identity }) =>
        under('projects', reminderStore.unreadByProject(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/notifications',
      handler: ({ identity }) =>
        under('notifications', reminderStore.notificationsOf(identity))
    })
  ])

  registerRoutes(app, routing, [
    defineRoute({
      method: 'GET',
      url: '/boards',
      handler: async ({ identity }) => ({
        ok: true,
        value: { boards: await store.listBoards(identity) }
      })
    }),
    defineRoute({
      method: 'GET',
      url: '/my-tasks',
      handler: async ({ identity }) => ({
        ok: true,
        value: { tasks: await store.assignedTasks(identity) }
      })
    }),
    defineRoute({
      method: 'GET',
      url: '/agenda',
      query: agendaQuery,
      handler: async ({ identity, query }) => ({
        ok: true,
        value: await store.agenda(identity, query.zone, query.days)
      })
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId',
      params: boardParams,
      handler: async ({ identity, params }) => {
        const board = await store.getBoard(identity, params.boardId)
        return board
          ? { ok: true, value: board }
          : { ok: false, error: 'not_found' }
      }
    }),
    defineRoute({
      method: 'POST',
      url: '/boards',
      body: newBoard,
      status: 201,
      handler: ({ identity, body }) =>
        body.keyPrefix === INBOX_KEY_PREFIX
          ? Promise.resolve({ ok: false, error: 'key_prefix_taken' })
          : store.createBoard(identity, body)
    }),
    defineRoute({
      method: 'PATCH',
      url: '/boards/:boardId',
      params: boardParams,
      body: boardRename,
      status: 204,
      handler: ({ identity, params, body }) =>
        store.renameBoard(identity, params.boardId, body.name)
    }),
    ...(
      [
        ['PUT', true],
        ['DELETE', false]
      ] as const
    ).map(([method, favorite]): BoardRoute =>
      defineRoute({
        method,
        url: '/boards/:boardId/favorite',
        params: boardParams,
        status: 204,
        handler: async ({ identity, params }) =>
          (await store.setFavorite(identity, params.boardId, favorite))
            ? { ok: true, value: null }
            : { ok: false, error: 'not_found' }
      })
    ),
    ...(
      [
        ['/boards/:boardId/layout', 'setLayout'],
        ['/boards/:boardId/default-layout', 'setDefaultLayout']
      ] as const
    ).map(([url, set]): BoardRoute =>
      defineRoute({
        method: 'PUT',
        url,
        params: boardParams,
        body: layoutChoice,
        status: 204,
        handler: ({ identity, params, body }) =>
          layoutStore[set](identity, params.boardId, body.layout)
      })
    )
  ])

  app.get(
    '/search',
    {
      onRequest: allowOrigins(app, '/search', deps.searchAllowedOrigins),
      preHandler: deps.requireIdentity,
      config: { searchTokens: true }
    },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const query = searchQuery.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      // Other apps search as the user types: a query too short to search
      // finds nothing rather than failing.
      if (query.data.q.length < deps.searchMinLength) return { tasks: [] }
      return { tasks: await store.search(identity, query.data.q) }
    }
  )

  registerRoutes(app, routing, [
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks',
      params: boardParams,
      body: newTask,
      status: 201,
      handler: ({ identity, params, body }) =>
        taskStore.createTask(identity, params.boardId, body)
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/move',
      params: taskParams,
      body: taskMove,
      status: 204,
      handler: ({ identity, params, body }) =>
        taskStore.moveTask(identity, params.boardId, params.taskId, body)
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/complete',
      params: taskParams,
      body: completion,
      status: 204,
      handler: ({ identity, params, body }) =>
        taskStore.completeTask(
          identity,
          params.boardId,
          params.taskId,
          body.state
        )
    }),
    defineRoute({
      method: 'PATCH',
      url: '/boards/:boardId/tasks/:taskId',
      params: taskParams,
      body: taskChanges,
      status: 204,
      handler: ({ identity, params, body }) =>
        taskStore.editTask(identity, params.boardId, params.taskId, body)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/tasks/:taskId/assignees',
      params: taskParams,
      body: assignment,
      status: 204,
      handler: ({ identity, params, body }) =>
        taskStore.setAssignees(
          identity,
          params.boardId,
          params.taskId,
          body.userIds
        )
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/description',
      params: taskParams,
      handler: ({ identity, params }) =>
        taskStore.getDescription(identity, params.boardId, params.taskId)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/tasks/:taskId/description',
      params: taskParams,
      body: descriptionEdit,
      handler: ({ identity, params, body }) =>
        taskStore.setDescription(identity, params.boardId, params.taskId, body)
    })
  ])

  registerRoutes(app, routing, [
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/labels',
      params: boardParams,
      body: newLabel,
      status: 201,
      handler: ({ identity, params, body }) =>
        labelStore.createLabel(identity, params.boardId, body)
    }),
    defineRoute({
      method: 'PATCH',
      url: '/boards/:boardId/labels/:labelId',
      params: labelParams,
      body: labelChanges,
      handler: ({ identity, params, body }) =>
        labelStore.editLabel(identity, params.boardId, params.labelId, body)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/tasks/:taskId/labels',
      params: taskParams,
      body: labeling,
      status: 204,
      handler: ({ identity, params, body }) =>
        labelStore.setLabels(
          identity,
          params.boardId,
          params.taskId,
          body.labelIds
        )
    })
  ])

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

  for (const method of ['put', 'delete'] as const) {
    app[method](
      '/boards/:boardId/tasks/:taskId/comments/:commentId/reactions/:emoji',
      { preHandler: deps.requireIdentity },
      async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = reactionParams.safeParse(request.params)
        if (!params.success) {
          return reply.code(404).send({ error: 'not_found' })
        }
        const { boardId, taskId, commentId } = params.data
        const emoji = reactionEmoji.safeParse(params.data.emoji)
        if (!emoji.success) {
          return reply.code(400).send({ error: 'invalid_request' })
        }
        const args = [identity, boardId, taskId, commentId, emoji.data] as const
        const result =
          method === 'put'
            ? await commentStore.addReaction(...args)
            : await commentStore.removeReaction(...args)
        if (!result.ok) return refuse(reply, result.error)
        return reply.code(204).send()
      }
    )
  }

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
