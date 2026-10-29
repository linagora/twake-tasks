import {
  boardMove,
  boardParams,
  inviteParams,
  memberParams,
  newInvite,
  peopleQuery,
  roleChange
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
import { createSharingStore } from './sharing.ts'

type ProjectRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const self = { on: 'self' } as const
const admin = { on: 'board', role: 'admin' } as const
const sharing = { ...admin, refusedOnManaged: true } as const

export function registerProjects(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
): ProjectRoute[] {
  const sharingStore = createSharingStore(deps.db)
  const routing = {
    requireIdentity: deps.requireIdentity,
    identify: (request: FastifyRequest) => request.identity,
    refusalStatus: REFUSAL_STATUS
  }

  const routes: ProjectRoute[] = [
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
    })
  ]
  registerRoutes(app, routing, routes)
  return routes
}
