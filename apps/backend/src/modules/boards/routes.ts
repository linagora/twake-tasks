import {
  boardParams,
  boardRename,
  keyPrefixParams,
  labelChanges,
  labeling,
  labelParams,
  layoutChoice,
  newBoard,
  newLabel,
  newSection,
  sectionChanges,
  sectionDeletion,
  sectionMove,
  sectionParams,
  taskParams
} from '@twake-tasks/api-contract'
import type * as wire from '@twake-tasks/api-contract'
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
import type { Refusal } from '../kernel/index.ts'
import { createLabelStore } from './labels.ts'
import { createLayoutStore } from './layouts.ts'
import type * as db from './schema.ts'
import { createSectionStore } from './sections.ts'
import { INBOX_KEY_PREFIX } from './keyPrefixes.ts'
import { createBoardStore } from './store.ts'

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

type BoardRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const self = { on: 'self' } as const
const viewer = { on: 'board', role: 'viewer' } as const
const editor = { on: 'board', role: 'editor' } as const
const admin = { on: 'board', role: 'admin' } as const

export function registerBoards(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
): BoardRoute[] {
  const store = createBoardStore(deps.db)
  const sectionStore = createSectionStore(deps.db)
  const labelStore = createLabelStore(deps.db)
  const layoutStore = createLayoutStore(deps.db)
  const routing = {
    requireIdentity: deps.requireIdentity,
    identify: (request: FastifyRequest) => request.identity,
    refusalStatus: REFUSAL_STATUS
  }

  const routes: BoardRoute[] = [
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
          store.setBoardArchived(identity, params.boardId, archived)
      })
    ),
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
