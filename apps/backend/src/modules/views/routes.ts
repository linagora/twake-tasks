import {
  agendaQuery,
  filterChanges,
  filterParams,
  newFilter,
  searchQuery,
  zoneQuery
} from '@twake-tasks/api-contract'
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
import { REFUSAL_STATUS } from '../../refusalStatus.ts'
import { under, type Refusal } from '../kernel/index.ts'
import { createFilterStore } from './filters.ts'
import { createViewStore } from './store.ts'

type ViewRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const self = { on: 'self' } as const

export function registerViews(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    searchAllowedOrigins: readonly string[]
    searchMinLength: number
  }
): ViewRoute[] {
  const store = createViewStore(deps.db)
  const filterStore = createFilterStore(deps.db)
  const routes: ViewRoute[] = [
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
    ).map(([method, favorite]): ViewRoute =>
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
