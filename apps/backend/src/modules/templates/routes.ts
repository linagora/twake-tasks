import {
  projectParams,
  projectTemplateParams,
  templateFields
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
import { checkProjectAccess } from '../boards/index.ts'
import { REFUSAL_STATUS } from '../../refusalStatus.ts'
import { under, type Refusal } from '../kernel/index.ts'
import { createTemplateStore } from './store.ts'

type TemplateRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const self = { on: 'self' } as const
const editor = { on: 'project', role: 'editor' } as const

export function registerTemplates(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
): TemplateRoute[] {
  const store = createTemplateStore(deps.db)
  const routing = {
    requireIdentity: deps.requireIdentity,
    identify: (request: FastifyRequest) => request.identity,
    refusalStatus: REFUSAL_STATUS,
    checkProjectAccess: checkProjectAccess(deps.db)
  }

  const routes: TemplateRoute[] = [
    defineRoute({
      method: 'GET',
      url: '/templates',
      access: self,
      handler: ({ identity }) =>
        under('templates', store.listTemplates(identity))
    }),
    defineRoute({
      method: 'POST',
      url: '/projects/:projectId/templates',
      access: editor,
      params: projectParams,
      body: templateFields,
      status: 201,
      handler: ({ identity, params, body }) =>
        store.createProjectTemplate(identity, params.projectId, body)
    }),
    defineRoute({
      method: 'PUT',
      url: '/projects/:projectId/templates/:templateId',
      access: editor,
      params: projectTemplateParams,
      body: templateFields,
      handler: ({ identity, params, body }) =>
        store.editProjectTemplate(
          identity,
          params.projectId,
          params.templateId,
          body
        )
    }),
    defineRoute({
      method: 'DELETE',
      url: '/projects/:projectId/templates/:templateId',
      access: editor,
      params: projectTemplateParams,
      status: 204,
      handler: ({ identity, params }) =>
        store.deleteProjectTemplate(
          identity,
          params.projectId,
          params.templateId
        )
    })
  ]
  registerRoutes(app, routing, routes)
  return routes
}
