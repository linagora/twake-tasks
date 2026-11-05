import {
  agendaQuery,
  calendarFeedChanges,
  calendarFeedParams,
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
import { createCalendarFeeds } from './calendarFeeds.ts'
import { createFilterStore } from './filters.ts'
import { createViewStore } from './store.ts'

type ViewRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const self = { on: 'self' } as const

// Calendars poll a feed every 15 minutes or more seldom.
const FEED_FETCHES_PER_HOUR = 20

export function registerViews(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    searchAllowedOrigins: readonly string[]
    searchMinLength: number
    appUrl: string
  }
): (ViewRoute | DeclaredRoute<null, 'not_found'>)[] {
  const store = createViewStore(deps.db)
  const filterStore = createFilterStore(deps.db)
  const feeds = createCalendarFeeds(deps.db, deps.appUrl)
  const routes: ViewRoute[] = [
    defineRoute({
      method: 'GET',
      url: '/calendar-feed',
      access: self,
      handler: async ({ identity }) => ({
        ok: true,
        value: { feed: await feeds.feedOf(identity) }
      })
    }),
    defineRoute({
      method: 'POST',
      url: '/calendar-feed',
      access: self,
      body: calendarFeedChanges,
      status: 201,
      handler: async ({ identity, body }) => ({
        ok: true,
        value: await feeds.open(identity, body.scope)
      })
    }),
    defineRoute({
      method: 'PATCH',
      url: '/calendar-feed',
      access: self,
      body: calendarFeedChanges,
      handler: async ({ identity, body }) => {
        const feed = await feeds.change(identity, body.scope)
        return feed
          ? { ok: true, value: { feed } }
          : { ok: false, error: 'not_found' }
      }
    }),
    defineRoute({
      method: 'DELETE',
      url: '/calendar-feed',
      access: self,
      status: 204,
      handler: async ({ identity }) => {
        await feeds.close(identity)
        return { ok: true, value: undefined }
      }
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
      url: '/sections',
      access: self,
      handler: ({ identity }) =>
        under('sections', filterStore.sectionNames(identity))
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
              : await store.search(identity, query.q, query)
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
  const open: DeclaredRoute<null, 'not_found'>[] = [
    defineRoute({
      method: 'GET',
      url: '/calendar/:token.ics',
      // Calendars subscribe without a session: the token stands for it.
      access: { on: 'public' },
      params: calendarFeedParams,
      config: {
        rateLimit: {
          max: FEED_FETCHES_PER_HOUR,
          timeWindow: 60 * 60 * 1000,
          keyGenerator: request =>
            `calendar-feed:${(request.params as { token: string }).token}`
        }
      },
      // The token is the link's only secret: whoever reads the logs must not
      // be able to subscribe with it.
      logSerializers: {
        req: (request: FastifyRequest) => ({
          method: request.method,
          url: request.routeOptions.url,
          remoteAddress: request.ip
        })
      },
      handler: async ({ params, http: { reply } }) => {
        const calendar = await feeds.calendar(params.token)
        if (calendar === null) return { ok: false, error: 'not_found' }
        await reply
          .header('content-type', 'text/calendar; charset=utf-8')
          .header('cache-control', 'no-store')
          .send(calendar)
        return { ok: true, value: undefined }
      }
    })
  ]
  registerRoutes(
    app,
    {
      requireIdentity: deps.requireIdentity,
      identify: () => null,
      refusalStatus: { not_found: 404 }
    },
    open
  )
  return [...routes, ...open]
}
