import {
  notificationParams,
  notificationsRead
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
import { createNotificationStore } from './store.ts'

const self = { on: 'self' } as const

export function registerNotifications(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
): DeclaredRoute<Identity, Refusal | 'invalid_request'>[] {
  const store = createNotificationStore(deps.db)
  const routes: DeclaredRoute<Identity, Refusal | 'invalid_request'>[] = [
    defineRoute({
      method: 'POST',
      url: '/notifications/read',
      access: self,
      body: notificationsRead,
      status: 204,
      handler: ({ identity, body }) => store.markAllRead(identity, body?.ids)
    }),
    defineRoute({
      method: 'POST',
      url: '/notifications/:notificationId/read',
      access: self,
      params: notificationParams,
      status: 204,
      handler: ({ identity, params }) =>
        store.markRead(identity, params.notificationId)
    }),
    defineRoute({
      method: 'GET',
      url: '/notifications/unread',
      access: self,
      handler: ({ identity }) =>
        under('projects', store.unreadByProject(identity))
    }),
    defineRoute({
      method: 'GET',
      url: '/notifications',
      access: self,
      handler: ({ identity }) =>
        under('notifications', store.notificationsOf(identity))
    })
  ]
  registerRoutes(
    app,
    {
      requireIdentity: deps.requireIdentity,
      identify: (request: FastifyRequest) => request.identity,
      refusalStatus: REFUSAL_STATUS
    },
    routes
  )
  return routes
}
