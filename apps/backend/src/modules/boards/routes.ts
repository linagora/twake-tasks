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
  keyPrefixParams,
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
  notificationParams,
  notificationsRead,
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
import type { FastifyRequest } from 'fastify'
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
import { INBOX_KEY_PREFIX } from './keyPrefixes.ts'
import { createBoardStore } from './store.ts'
import { createTaskStore, type Refusal, type Result } from './tasks.ts'
import { createTransferStore } from './transfer.ts'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
type Values<T extends readonly string[]> = T[number]

// The contract declares its own enums, so tsc fails here when they drift.
/** @public */
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

const REFUSAL_STATUS: Record<Refusal | 'invalid_request', number> = {
  // A reaction's emoji is part of the URL, yet a bad one is a bad request,
  // not a missing resource.
  invalid_request: 400,
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

type BoardRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const self = { on: 'self' } as const
const viewer = { on: 'board', role: 'viewer' } as const
const editor = { on: 'board', role: 'editor' } as const
const admin = { on: 'board', role: 'admin' } as const
const sharing = { ...admin, refusedOnManaged: true } as const

async function under<K extends string, T>(
  key: K,
  pending: Promise<Result<T>>
): Promise<Result<Record<K, T>>> {
  const result = await pending
  return result.ok
    ? { ok: true, value: { [key]: result.value } as Record<K, T> }
    : result
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
): BoardRoute[] {
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

  const routes: BoardRoute[] = [
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/invites',
      access: sharing,
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
      access: sharing,
      params: boardParams,
      handler: ({ identity, params }) =>
        sharingStore.sharing(identity, params.boardId)
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/sharing/people',
      access: sharing,
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
      access: sharing,
      params: inviteParams,
      status: 204,
      handler: ({ identity, params }) =>
        sharingStore.cancelInvite(identity, params.boardId, params.inviteId)
    }),
    defineRoute({
      method: 'GET',
      url: '/projects',
      access: self,
      handler: async ({ identity }) => ({
        ok: true,
        value: { projects: await sharingStore.myProjects(identity) }
      })
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/move',
      // An editor of the target project too.
      access: admin,
      params: boardParams,
      body: boardMove,
      status: 204,
      handler: ({ identity, params, body }) =>
        sharingStore.moveToProject(identity, params.boardId, body.projectId)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/members/:userId',
      access: sharing,
      params: memberParams,
      body: roleChange,
      status: 204,
      handler: ({ identity, params, body }) =>
        sharingStore.setRole(identity, params.boardId, params.userId, body.role)
    }),
    defineRoute({
      method: 'DELETE',
      url: '/boards/:boardId/members/:userId',
      // To remove someone else. Any member may leave, but not a personal or
      // managed project.
      access: sharing,
      params: memberParams,
      status: 204,
      handler: ({ identity, params }) =>
        sharingStore.removeMember(identity, params.boardId, params.userId)
    }),
    ...(
      [
        ['archive', true],
        ['unarchive', false]
      ] as const
    ).map(([path, archived]): BoardRoute =>
      defineRoute({
        method: 'POST',
        url: `/boards/:boardId/${path}`,
        access: admin,
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
        access: viewer,
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
        access: editor,
        params: taskParams,
        status: 204,
        handler: ({ identity, params }) =>
          archiveStore[change](identity, params.boardId, params.taskId)
      })
    ),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/transfer/preview',
      // On the target board too.
      access: editor,
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
      // On the target board too.
      access: editor,
      params: taskParams,
      body: transferTarget,
      handler: ({ identity, params, body }) =>
        transferStore.transferTask(
          identity,
          params.boardId,
          params.taskId,
          body
        )
    }),
    defineRoute({
      method: 'GET',
      url: '/filters',
      access: self,
      handler: ({ identity }) =>
        under('filters', filterStore.listFilters(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/labels',
      access: self,
      handler: ({ identity }) =>
        under('labels', filterStore.labelNames(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/people',
      access: self,
      handler: ({ identity }) => under('people', filterStore.people(identity))
    }),
    defineRoute({
      method: 'POST',
      url: '/filters',
      access: self,
      body: newFilter,
      status: 201,
      handler: ({ identity, body }) =>
        filterStore.createFilter(identity, body.name, body.criteria)
    }),
    defineRoute({
      method: 'PATCH',
      url: '/filters/:filterId',
      access: self,
      params: filterParams,
      body: filterChanges,
      status: 204,
      handler: ({ identity, params, body }) =>
        filterStore.updateFilter(identity, params.filterId, body)
    }),
    defineRoute({
      method: 'DELETE',
      url: '/filters/:filterId',
      access: self,
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
        access: self,
        params: filterParams,
        status: 204,
        handler: ({ identity, params }) =>
          filterStore.updateFilter(identity, params.filterId, { favorite })
      })
    ),
    defineRoute({
      method: 'GET',
      url: '/filters/:filterId/tasks',
      access: self,
      params: filterParams,
      query: zoneQuery,
      handler: ({ identity, params, query }) =>
        under(
          'tasks',
          filterStore.filteredTasks(identity, params.filterId, query.zone)
        )
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/reminders',
      access: viewer,
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
      access: viewer,
      params: taskParams,
      body: newReminder,
      status: 201,
      handler: ({ identity, params, body }) =>
        reminderStore.addReminder(identity, params.boardId, params.taskId, body)
    }),
    defineRoute({
      method: 'DELETE',
      url: '/boards/:boardId/tasks/:taskId/reminders/:reminderId',
      access: viewer,
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
      access: viewer,
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
        access: viewer,
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
      access: self,
      body: notificationsRead,
      status: 204,
      handler: ({ identity, body }) =>
        reminderStore.markAllRead(identity, body?.ids)
    }),
    defineRoute({
      method: 'POST',
      url: '/notifications/:notificationId/read',
      access: self,
      params: notificationParams,
      status: 204,
      handler: ({ identity, params }) =>
        reminderStore.markRead(identity, params.notificationId)
    }),
    defineRoute({
      method: 'GET',
      url: '/notifications/unread',
      access: self,
      handler: ({ identity }) =>
        under('projects', reminderStore.unreadByProject(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/notifications',
      access: self,
      handler: ({ identity }) =>
        under('notifications', reminderStore.notificationsOf(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/boards',
      access: self,
      handler: async ({ identity }) => ({
        ok: true,
        value: { boards: await store.listBoards(identity) }
      })
    }),
    defineRoute({
      method: 'GET',
      url: '/my-tasks',
      access: self,
      handler: async ({ identity }) => ({
        ok: true,
        value: { tasks: await store.assignedTasks(identity) }
      })
    }),
    defineRoute({
      method: 'GET',
      url: '/agenda',
      access: self,
      query: agendaQuery,
      handler: async ({ identity, query }) => ({
        ok: true,
        value: await store.agenda(identity, query.zone, query.days)
      })
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId',
      access: viewer,
      params: boardParams,
      handler: async ({ identity, params }) => {
        const board = await store.getBoard(identity, params.boardId)
        return board
          ? { ok: true, value: board }
          : { ok: false, error: 'not_found' }
      }
    }),
    defineRoute({
      method: 'GET',
      url: '/key-prefixes/:keyPrefix',
      access: self,
      params: keyPrefixParams,
      handler: async ({ identity, params }) => ({
        ok: true,
        value: await store.keyPrefixFor(identity, params.keyPrefix)
      })
    }),
    defineRoute({
      method: 'POST',
      url: '/boards',
      // An admin of the project it is made in, if any.
      access: self,
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
      access: admin,
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
        access: viewer,
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
        ['/boards/:boardId/layout', 'setLayout', viewer],
        ['/boards/:boardId/default-layout', 'setDefaultLayout', admin]
      ] as const
    ).map(([url, set, access]): BoardRoute =>
      defineRoute({
        method: 'PUT',
        url,
        access,
        params: boardParams,
        body: layoutChoice,
        status: 204,
        handler: ({ identity, params, body }) =>
          layoutStore[set](identity, params.boardId, body.layout)
      })
    ),
    defineRoute({
      method: 'GET',
      url: '/search',
      access: self,
      onRequest: allowOrigins(app, '/search', deps.searchAllowedOrigins),
      config: { searchTokens: true },
      query: searchQuery,
      handler: async ({ identity, query }) => ({
        ok: true,
        value: {
          // Other apps search as the user types: a query too short to search
          // finds nothing rather than failing.
          tasks:
            query.q.length < deps.searchMinLength
              ? []
              : await store.search(identity, query.q)
        }
      })
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks',
      access: editor,
      params: boardParams,
      body: newTask,
      status: 201,
      handler: ({ identity, params, body }) =>
        taskStore.createTask(identity, params.boardId, body)
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/move',
      access: editor,
      params: taskParams,
      body: taskMove,
      status: 204,
      handler: ({ identity, params, body }) =>
        taskStore.moveTask(identity, params.boardId, params.taskId, body)
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/complete',
      access: editor,
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
      access: editor,
      params: taskParams,
      body: taskChanges,
      status: 204,
      handler: ({ identity, params, body }) =>
        taskStore.editTask(identity, params.boardId, params.taskId, body)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/tasks/:taskId/assignees',
      access: editor,
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
      access: viewer,
      params: taskParams,
      handler: ({ identity, params }) =>
        taskStore.getDescription(identity, params.boardId, params.taskId)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/tasks/:taskId/description',
      access: editor,
      params: taskParams,
      body: descriptionEdit,
      handler: ({ identity, params, body }) =>
        taskStore.setDescription(identity, params.boardId, params.taskId, body)
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/labels',
      access: editor,
      params: boardParams,
      body: newLabel,
      status: 201,
      handler: ({ identity, params, body }) =>
        labelStore.createLabel(identity, params.boardId, body)
    }),
    defineRoute({
      method: 'PATCH',
      url: '/boards/:boardId/labels/:labelId',
      access: editor,
      params: labelParams,
      body: labelChanges,
      handler: ({ identity, params, body }) =>
        labelStore.editLabel(identity, params.boardId, params.labelId, body)
    }),
    defineRoute({
      method: 'PUT',
      url: '/boards/:boardId/tasks/:taskId/labels',
      access: editor,
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
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/history',
      access: viewer,
      params: taskParams,
      handler: ({ identity, params }) =>
        under(
          'entries',
          historyOf(deps.db, identity, params.boardId, params.taskId)
        )
    }),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/comments',
      access: viewer,
      params: taskParams,
      handler: ({ identity, params }) =>
        under(
          'comments',
          commentStore.listComments(identity, params.boardId, params.taskId)
        )
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/comments',
      access: viewer,
      params: taskParams,
      body: newComment,
      status: 201,
      handler: ({ identity, params, body }) =>
        commentStore.addComment(
          identity,
          params.boardId,
          params.taskId,
          body.body
        )
    }),
    ...(['PUT', 'DELETE'] as const).map((method): BoardRoute =>
      defineRoute({
        method,
        url: '/boards/:boardId/tasks/:taskId/comments/:commentId/reactions/:emoji',
        access: viewer,
        params: reactionParams,
        status: 204,
        handler: async ({ identity, params }) => {
          const emoji = reactionEmoji.safeParse(params.emoji)
          if (!emoji.success) return { ok: false, error: 'invalid_request' }
          const { boardId, taskId, commentId } = params
          const args = [
            identity,
            boardId,
            taskId,
            commentId,
            emoji.data
          ] as const
          return method === 'PUT'
            ? commentStore.addReaction(...args)
            : commentStore.removeReaction(...args)
        }
      })
    ),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/sections',
      access: admin,
      params: boardParams,
      body: newSection,
      status: 201,
      handler: ({ identity, params, body }) =>
        sectionStore.createSection(identity, params.boardId, body)
    }),
    defineRoute({
      method: 'PATCH',
      url: '/boards/:boardId/sections/:sectionId',
      access: admin,
      params: sectionParams,
      body: sectionChanges,
      status: 204,
      handler: ({ identity, params, body }) =>
        sectionStore.editSection(
          identity,
          params.boardId,
          params.sectionId,
          body
        )
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/sections/:sectionId/move',
      access: admin,
      params: sectionParams,
      body: sectionMove,
      status: 204,
      handler: ({ identity, params, body }) =>
        sectionStore.moveSection(
          identity,
          params.boardId,
          params.sectionId,
          body
        )
    }),
    defineRoute({
      method: 'DELETE',
      url: '/boards/:boardId/sections/:sectionId',
      access: admin,
      params: sectionParams,
      // A delete may come without a body.
      body: sectionDeletion.nullish(),
      status: 204,
      handler: ({ identity, params, body }) =>
        sectionStore.deleteSection(
          identity,
          params.boardId,
          params.sectionId,
          body?.tasksTo
        )
    })
  ]
  registerRoutes(app, routing, routes)
  return routes
}
