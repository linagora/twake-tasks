import {
  assignment,
  boardParams,
  completion,
  descriptionEdit,
  newReminder,
  newTask,
  reminderParams,
  taskChanges,
  taskMove,
  taskParams,
  transferTarget
} from '@twake-tasks/api-contract'
import type { FastifyRequest } from 'fastify'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import {
  defineRoute,
  registerRoutes,
  type DeclaredRoute
} from '../../infra/route.ts'
import type { Identity, RequireIdentity } from '../auth/index.ts'
import { REFUSAL_STATUS } from '../../refusalStatus.ts'
import { under, type Refusal } from '../kernel/index.ts'
import { createArchiveStore } from './archive.ts'
import { historyOf } from './history.ts'
import { createReminderStore } from './reminders.ts'
import { createTaskStore } from './tasks.ts'
import { createTransferStore } from './transfer.ts'

type TaskRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const viewer = { on: 'board', role: 'viewer' } as const
const editor = { on: 'board', role: 'editor' } as const

export function registerTasks(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    // 0 for no cap.
    pendingReminders: number
  }
): TaskRoute[] {
  const taskStore = createTaskStore(deps.db)
  const reminderStore = createReminderStore(deps.db, deps.pendingReminders)
  const archiveStore = createArchiveStore(deps.db)
  const transferStore = createTransferStore(deps.db)
  const routing = {
    requireIdentity: deps.requireIdentity,
    identify: (request: FastifyRequest) => request.identity,
    refusalStatus: REFUSAL_STATUS
  }

  const routes: TaskRoute[] = [
    ...(
      [
        ['archived', 'archivedAt'],
        ['trash', 'deletedAt']
      ] as const
    ).map(([path, stamp]): TaskRoute =>
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
    ).map(([method, path, change]): TaskRoute =>
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
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/history',
      access: viewer,
      params: taskParams,
      handler: ({ identity, params }) =>
        under(
          'entries',
          historyOf(deps.db, identity, params.boardId, params.taskId)
        )
    })
  ]
  registerRoutes(app, routing, routes)
  return routes
}
