import {
  agendaQuery,
  assignment,
  boardMove,
  boardParams,
  boardRename,
  completion,
  defaultFilterNames,
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
  sidebarLayout,
  sidebarSectionName,
  sidebarSectionParams,
  taskChanges,
  taskMove,
  taskParams,
  transferTarget,
  zoneQuery
} from '@twake-tasks/api-contract'
import type * as wire from '@twake-tasks/api-contract'
import type { FastifyReply } from 'fastify'
import type { z } from 'zod'
import { allowOrigins } from '../../infra/cors.ts'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { createArchiveStore } from './archive.ts'
import { createCommentStore } from './comments.ts'
import { createFilterStore, criteriaOf, type View } from './filters.ts'
import { historyOf } from './history.ts'
import { createLabelStore } from './labels.ts'
import { createLayoutStore } from './layouts.ts'
import { createSharingStore } from './sharing.ts'
import { createReminderStore } from './reminders.ts'
import type * as db from './schema.ts'
import { createSectionStore } from './sections.ts'
import { createBoardStore, INBOX_KEY_PREFIX } from './store.ts'
import { createSidebarStore } from './sidebar.ts'
import { createTaskStore, type Refusal } from './tasks.ts'
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
  Assert<Same<Values<typeof wire.GROUPINGS>, Values<typeof db.GROUPINGS>>>,
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

const viewOf = ({
  name,
  criteria,
  icon,
  layout,
  groupBy,
  allColumns
}: z.output<typeof newFilter>): View => ({
  name,
  criteria: criteriaOf(criteria),
  icon: icon ?? null,
  layout: layout ?? 'list',
  groupBy: groupBy ?? 'status',
  allColumns: allColumns ?? false
})

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
  const sidebarStore = createSidebarStore(deps.db)
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

  app.get(
    '/boards/:boardId/sharing/people',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const query = peopleQuery.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sharingStore.suggestPeople(
        identity,
        params.data.boardId,
        query.data.q
      )
      if (!result.ok) return refuse(reply, result.error)
      return { people: result.value }
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
      const body = boardMove.safeParse(request.body)
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
    '/boards/:boardId/tasks/:taskId/transfer/preview',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = transferTarget.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await transferStore.previewTransfer(
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
    '/boards/:boardId/tasks/:taskId/transfer',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = taskParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = transferTarget.safeParse(request.body)
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
      const body = roleChange.safeParse(request.body)
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
      const result = await filterStore.labelChoices(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { labels: result.value }
    }
  )

  app.get(
    '/statuses',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await filterStore.statusNames(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { statuses: result.value }
    }
  )

  app.get(
    '/people',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await filterStore.people(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { people: result.value }
    }
  )

  app.get(
    '/sidebar/sections',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const result = await sidebarStore.listSections(identity)
      if (!result.ok) return refuse(reply, result.error)
      return { sections: result.value }
    }
  )

  app.post(
    '/sidebar/sections',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const body = sidebarSectionName.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sidebarStore.createSection(identity, body.data.name)
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  // The whole layout at once: the order of the sections and their items.
  app.put(
    '/sidebar/sections',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const body = sidebarLayout.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sidebarStore.saveLayout(identity, body.data.sections)
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.patch(
    '/sidebar/sections/:sectionId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = sidebarSectionParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = sidebarSectionName.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await sidebarStore.renameSection(
        identity,
        params.data.sectionId,
        body.data.name
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.delete(
    '/sidebar/sections/:sectionId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = sidebarSectionParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const result = await sidebarStore.deleteSection(
        identity,
        params.data.sectionId
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
    }
  )

  app.post(
    '/filters/defaults',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const body = defaultFilterNames.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await filterStore.makeDefaultFilters(identity, body.data)
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
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
      const result = await filterStore.createFilter(identity, viewOf(body.data))
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.patch(
    '/filters/:filterId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = filterParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = filterChanges.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const { criteria, ...changes } = body.data
      const result = await filterStore.updateFilter(
        identity,
        params.data.filterId,
        criteria ? { ...changes, criteria: criteriaOf(criteria) } : changes
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(204).send()
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

  for (const [method, favorite] of [
    ['PUT', true],
    ['DELETE', false]
  ] as const) {
    app.route({
      method,
      url: '/filters/:filterId/favorite',
      preHandler: deps.requireIdentity,
      handler: async (request, reply) => {
        const identity = request.identity
        if (!identity) return reply.code(401).send()
        const params = filterParams.safeParse(request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const result = await filterStore.updateFilter(
          identity,
          params.data.filterId,
          { favorite }
        )
        if (!result.ok) return refuse(reply, result.error)
        return reply.code(204).send()
      }
    })
  }

  app.put(
    '/filters/:filterId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = filterParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = newFilter.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await filterStore.updateFilter(
        identity,
        params.data.filterId,
        viewOf(body.data)
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
    '/boards/:boardId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = boardRename.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await store.renameBoard(
        identity,
        params.data.boardId,
        body.data.name
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
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return reply.code(201).send(result.value)
    }
  )

  app.patch(
    '/boards/:boardId/labels/:labelId',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = labelParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const body = labelChanges.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_request' })
      }
      const result = await labelStore.editLabel(
        identity,
        params.data.boardId,
        params.data.labelId,
        body.data
      )
      if (!result.ok) return refuse(reply, result.error)
      return result.value
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
