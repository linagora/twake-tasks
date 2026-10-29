import { randomUUID } from 'node:crypto'
import type { HTTPMethods, LightMyRequestResponse } from 'fastify'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createChanges } from '../infra/changes.ts'
import { createDb, inTenant } from '../infra/db.ts'
import { createServer } from '../infra/http.ts'
import type { Access } from '../infra/route.ts'
import {
  aB2cUser,
  aManagedProject,
  aUser,
  joinBoard,
  startApp,
  type TestUser
} from '../testing/app.ts'
import { openStream } from '../testing/stream.ts'
import { registerAuth } from './auth/index.ts'
import { registerLive } from './boards/liveRoutes.ts'
import { registerBoards } from './boards/routes.ts'
import { notifications } from './boards/schema.ts'
import { registerCollaboration } from './collaboration/index.ts'
import { registerNotifications } from './notifications/index.ts'
import { registerProjects } from './projects/index.ts'
import { registerSettings } from './settings/index.ts'
import { registerTasks } from './tasks/index.ts'
import { registerViews } from './views/index.ts'

interface Declared {
  method: HTTPMethods
  url: string
  access: Access
  status?: number
  config?: { stream?: boolean }
}

interface Fixture {
  boardId: string
  taskId: string
  sectionId: string
  labelId: string
  commentId: string
  inviteId: string
}

interface Request {
  params?: Record<string, string>
  query?: Record<string, string>
  body?: object
  // The status a permitted caller gets when the example is refused by design.
  answer?: number
}

type Example = (fixture: Fixture, me: TestUser) => Request | Promise<Request>

type Kind = 'shared' | 'managed'

let api: Awaited<ReturnType<typeof startApp>>
let baseUrl: string
const { sql, db } = createDb(inject('databaseUrl'))

const organizationId = `org-${randomUUID()}`
const admin = aUser({ organizationId })
const editor = aUser({ organizationId })
const viewer = aUser({ organizationId })
const bystander = aUser({ organizationId })
const actors: [string, TestUser, 'admin' | 'editor' | 'viewer' | null][] = [
  ['admin', admin, 'admin'],
  ['editor', editor, 'editor'],
  ['viewer', viewer, 'viewer'],
  ['outsider', aUser({ organizationId }), null],
  ['other organization', aUser(), null],
  ['B2C user', aB2cUser(), null]
]
const RANK = { viewer: 0, editor: 1, admin: 2 }
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

// Unique in the organization, which every fixture shares.
const aKeyPrefix = () =>
  `K${randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase()}`

function declaredRoutes(): Declared[] {
  const scratch = createServer({
    logger: pino({ level: 'silent' }),
    isReady: () => Promise.resolve(true)
  })
  const requireIdentity = () => Promise.resolve(undefined)
  const unused = () => Promise.reject(new Error('not called'))
  const off = { max: 0, windowSeconds: 1 }
  return [
    ...registerAuth(scratch, {
      authenticate: unused,
      provider: { identify: unused, verifyLogoutToken: unused },
      store: { isRevoked: unused, revoke: unused },
      addressLimits: { refusedTokens: off, logoutRefusals: off, tokenChecks: 0 }
    }).routes,
    ...registerProjects(scratch, { db, requireIdentity }),
    ...registerBoards(scratch, { db, requireIdentity }),
    ...registerTasks(scratch, {
      db,
      requireIdentity,
      pendingReminders: 0
    }),
    ...registerCollaboration(scratch, {
      db,
      requireIdentity,
      mentionsPerComment: 0
    }),
    ...registerViews(scratch, {
      db,
      requireIdentity,
      searchAllowedOrigins: [],
      searchMinLength: 2
    }),
    ...registerLive(scratch, {
      db,
      requireIdentity,
      changes: createChanges(),
      streamVersions: unused
    }),
    ...registerNotifications(scratch, { db, requireIdentity }),
    ...registerSettings(scratch, { db, requireIdentity })
  ]
}

const idOf = (route: Declared) => `${route.method} ${route.url}`

beforeAll(async () => {
  api = await startApp()
  baseUrl = await api.listen()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function send(
  user: TestUser,
  route: Declared,
  request: Request,
  fixture?: Fixture
): Promise<{ statusCode: number; body: string }> {
  const values: Record<string, string> = { ...fixture, ...request.params }
  const url = route.url.replace(/:(\w+)/g, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`no ${name} for ${idOf(route)}`)
    return encodeURIComponent(value)
  })
  const method = METHODS.find(known => known === route.method)
  if (!method) throw new Error(`no method for ${idOf(route)}`)
  if (route.config?.stream) {
    const stream = openStream(`${baseUrl}/api${url}`, api.tokenOf(user))
    const response = await stream.response
    const body = response.ok ? '' : await response.text()
    stream.close()
    return { statusCode: response.status, body }
  }
  return api.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${api.tokenOf(user)}` },
    ...(request.query && { query: request.query }),
    ...(request.body && { payload: request.body })
  })
}

async function created<T>(
  pending: Promise<LightMyRequestResponse>,
  what: string
): Promise<T> {
  const response = await pending
  if (response.statusCode >= 300) {
    throw new Error(`${what}: ${String(response.statusCode)} ${response.body}`)
  }
  return response.json<T>()
}

async function fixture(kind: Kind): Promise<Fixture> {
  const as = api.as(admin)
  const projectId =
    kind === 'managed'
      ? await aManagedProject(db, [
          [admin, 'admin'],
          [editor, 'editor'],
          [viewer, 'viewer'],
          [bystander, 'viewer']
        ])
      : undefined
  const board = await created<{ id: string; sections: { id: string }[] }>(
    as.post('/boards', { name: 'Design', keyPrefix: aKeyPrefix(), projectId }),
    'board'
  )
  const boardId = board.id
  if (kind === 'shared') {
    for (const [user, role] of [
      [editor, 'editor'],
      [viewer, 'viewer'],
      [bystander, 'viewer']
    ] as const) {
      await joinBoard(db, admin, boardId, user, role)
    }
  }
  const section = board.sections[0]
  if (!section) throw new Error('no default sections')
  const at = `/boards/${boardId}`
  // Outside every section, since only such a task is completed by hand.
  const task = await created<{ id: string }>(
    as.post(`${at}/tasks`, { sectionId: null, title: 'Logo' }),
    'task'
  )
  const label = await created<{ id: string }>(
    as.post(`${at}/labels`, { name: 'Brand' }),
    'label'
  )
  const comment = await created<{ id: string }>(
    as.post(`${at}/tasks/${task.id}/comments`, { body: 'Nice' }),
    'comment'
  )
  let inviteId: string = randomUUID()
  if (kind === 'shared') {
    await created(
      as.post(`${at}/invites`, {
        email: `guest-${randomUUID()}@example.com`,
        role: 'viewer'
      }),
      'invite'
    )
    const sharing = await created<{ invites: { id: string }[] }>(
      as.get(`${at}/sharing`),
      'sharing'
    )
    inviteId = sharing.invites[0]?.id ?? inviteId
  }
  return {
    boardId,
    taskId: task.id,
    sectionId: section.id,
    labelId: label.id,
    commentId: comment.id,
    inviteId
  }
}

async function idOrNone(pending: Promise<LightMyRequestResponse>) {
  const response = await pending
  return response.statusCode < 300
    ? response.json<{ id: string }>().id
    : randomUUID()
}

const ownBoard = (me: TestUser) =>
  created<{ id: string; project: { id: string } }>(
    api.as(me).post('/boards', { name: 'Mine', keyPrefix: aKeyPrefix() }),
    'own board'
  )

const ownFilter = (me: TestUser, criteria = {}) =>
  created<{ id: string }>(
    api.as(me).post('/filters', { name: 'Mine', criteria }),
    'own filter'
  )

async function ownNotification(me: TestUser) {
  const board = await ownBoard(me)
  const task = await created<{ id: string }>(
    api.as(me).post(`/boards/${board.id}/tasks`, {
      sectionId: null,
      title: 'Call'
    }),
    'own task'
  )
  return inTenant(db, me, async tx => {
    const [row] = await tx
      .insert(notifications)
      .values({
        taskId: task.id,
        organizationId: me.organizationId,
        userId: me.userId,
        reason: 'assigned'
      })
      .returning({ id: notifications.id })
    if (!row) throw new Error('no notification')
    return row.id
  })
}

const later = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const task = '/boards/:boardId/tasks/:taskId'
const none: Example = () => ({})

const EXAMPLES: Record<string, Example> = {
  'POST /boards/:boardId/invites': () => ({
    body: { email: `new-${randomUUID()}@example.com`, role: 'viewer' }
  }),
  'GET /boards/:boardId/sharing': none,
  'GET /boards/:boardId/sharing/people': () => ({ query: { q: 'user' } }),
  'DELETE /boards/:boardId/invites/:inviteId': none,
  'GET /projects': none,
  'POST /boards/:boardId/move': async (_fixture, me) => ({
    body: { projectId: (await ownBoard(me)).project.id }
  }),
  'PUT /boards/:boardId/members/:userId': () => ({
    params: { userId: bystander.userId },
    body: { role: 'viewer' }
  }),
  'DELETE /boards/:boardId/members/:userId': () => ({
    params: { userId: bystander.userId }
  }),
  'POST /boards/:boardId/archive': none,
  'POST /boards/:boardId/unarchive': none,
  'GET /boards/:boardId/archived': none,
  'GET /boards/:boardId/trash': none,
  [`POST ${task}/archive`]: none,
  [`POST ${task}/restore`]: none,
  [`DELETE ${task}`]: none,
  [`POST ${task}/transfer/preview`]: async (_fixture, me) => ({
    body: { boardId: (await ownBoard(me)).id, sectionId: null }
  }),
  [`POST ${task}/transfer`]: async (_fixture, me) => ({
    body: { boardId: (await ownBoard(me)).id, sectionId: null }
  }),
  'GET /filters': none,
  'GET /labels': none,
  'GET /people': none,
  'POST /filters': () => ({ body: { name: 'Mine', criteria: {} } }),
  'PATCH /filters/:filterId': async (_fixture, me) => ({
    params: { filterId: (await ownFilter(me)).id },
    body: { name: 'Ours' }
  }),
  'DELETE /filters/:filterId': async (_fixture, me) => ({
    params: { filterId: (await ownFilter(me)).id }
  }),
  'PUT /filters/:filterId/favorite': async (_fixture, me) => ({
    params: { filterId: (await ownFilter(me)).id }
  }),
  'DELETE /filters/:filterId/favorite': async (_fixture, me) => ({
    params: { filterId: (await ownFilter(me)).id }
  }),
  // A filter matching every task would load each board the matrix created.
  'GET /filters/:filterId/tasks': async (_fixture, me) => ({
    params: { filterId: (await ownFilter(me, { priority: [1] })).id },
    query: { zone: 'Europe/Paris' }
  }),
  [`GET ${task}/reminders`]: none,
  [`POST ${task}/reminders`]: () => ({ body: { at: later() } }),
  [`DELETE ${task}/reminders/:reminderId`]: async (fixture, me) => ({
    params: {
      reminderId: await idOrNone(
        api
          .as(me)
          .post(
            `/boards/${fixture.boardId}/tasks/${fixture.taskId}/reminders`,
            {
              at: later()
            }
          )
      )
    }
  }),
  [`GET ${task}/follow`]: none,
  [`PUT ${task}/follow`]: none,
  [`DELETE ${task}/follow`]: none,
  'POST /notifications/read': () => ({ body: {} }),
  'POST /notifications/:notificationId/read': async (_fixture, me) => ({
    params: { notificationId: await ownNotification(me) }
  }),
  'GET /notifications/unread': none,
  'GET /notifications': none,
  'GET /boards': none,
  'GET /my-tasks': none,
  'GET /agenda': () => ({ query: { zone: 'Europe/Paris', days: '7' } }),
  'GET /boards/:boardId': none,
  'GET /key-prefixes/:keyPrefix': () => ({ params: { keyPrefix: 'ABC' } }),
  'POST /boards': () => ({ body: { name: 'Plans', keyPrefix: aKeyPrefix() } }),
  'PATCH /boards/:boardId': () => ({ body: { name: 'Design 2' } }),
  'PUT /boards/:boardId/favorite': none,
  'DELETE /boards/:boardId/favorite': none,
  'PUT /boards/:boardId/layout': () => ({ body: { layout: 'list' } }),
  'PUT /boards/:boardId/default-layout': () => ({ body: { layout: 'list' } }),
  'GET /search': () => ({ query: { q: 'logo' } }),
  'POST /boards/:boardId/tasks': () => ({
    body: { sectionId: null, title: 'Brief' }
  }),
  [`POST ${task}/move`]: fixture => ({
    body: { sectionId: fixture.sectionId }
  }),
  [`POST ${task}/complete`]: () => ({ body: { state: 'completed' } }),
  [`PATCH ${task}`]: () => ({ body: { title: 'Logo 2' } }),
  [`PUT ${task}/assignees`]: () => ({ body: { userIds: [] } }),
  [`GET ${task}/description`]: none,
  [`PUT ${task}/description`]: () => ({
    body: { markdown: 'Round', version: 0 }
  }),
  'POST /boards/:boardId/labels': () => ({ body: { name: 'Print' } }),
  'PATCH /boards/:boardId/labels/:labelId': () => ({
    body: { name: 'Brand 2' }
  }),
  [`PUT ${task}/labels`]: fixture => ({
    body: { labelIds: [fixture.labelId] }
  }),
  [`GET ${task}/history`]: none,
  [`GET ${task}/comments`]: none,
  [`POST ${task}/comments`]: () => ({ body: { body: 'Agreed' } }),
  [`PUT ${task}/comments/:commentId/reactions/:emoji`]: () => ({
    params: { emoji: '👍' }
  }),
  [`DELETE ${task}/comments/:commentId/reactions/:emoji`]: () => ({
    params: { emoji: '👍' }
  }),
  'POST /boards/:boardId/sections': () => ({
    body: { name: 'Review', category: 'started' }
  }),
  'PATCH /boards/:boardId/sections/:sectionId': () => ({
    body: { name: 'Doing' }
  }),
  'POST /boards/:boardId/sections/:sectionId/move': () => ({ body: {} }),
  'DELETE /boards/:boardId/sections/:sectionId': none,
  'GET /settings': none,
  'GET /boards/:boardId/events': none,
  // The tests' identity provider refuses every logout token.
  'POST /auth/backchannel-logout': () => ({
    body: { logout_token: 'forged' },
    answer: 400
  })
}

function expected(
  access: Access,
  success: number,
  kind: Kind,
  role: 'admin' | 'editor' | 'viewer' | null
) {
  if (access.on === 'public' || access.on === 'self') return success
  if (!role) return 404
  if (RANK[role] < RANK[access.role]) return 403
  if (kind === 'managed' && access.refusedOnManaged) return 403
  return success
}

const routes = declaredRoutes()

describe('the permission matrix', () => {
  it('declares every route the app serves', () => {
    expect(
      servedRoutes(api.printRoutes({ commonPrefix: false })).sort()
    ).toEqual(routes.map(idOf).sort())
  })

  it('has an example for every declared route', () => {
    expect(routes.map(idOf).filter(id => !(id in EXAMPLES))).toEqual([])
  })

  it.each(routes.map(route => [idOf(route), route] as const))(
    '%s answers each caller as declared',
    async (id, route) => {
      const example = EXAMPLES[id]
      if (!example) throw new Error(`no example for ${id}`)
      const kinds: Kind[] =
        route.access.on === 'board' ? ['shared', 'managed'] : ['shared']
      const mismatches = []
      for (const kind of kinds) {
        // A refusal changes nothing, so its fixture serves the next caller.
        let current: Fixture | undefined
        for (const [name, user, role] of actors) {
          if (route.access.on === 'board') current ??= await fixture(kind)
          const request = await example(current ?? EMPTY, user)
          const response = await send(user, route, request, current)
          const success = request.answer ?? route.status ?? 200
          const want = expected(route.access, success, kind, role)
          if (response.statusCode !== want) {
            mismatches.push({
              kind,
              caller: name,
              want,
              got: response.statusCode,
              body: response.body
            })
          }
          if (response.statusCode < 300) current = undefined
        }
      }

      expect(mismatches).toEqual([])
    }
  )

  it('is documented in docs/permissions.md', async () => {
    await expect(permissionsDoc(routes)).toMatchFileSnapshot(
      '../../../../docs/permissions.md'
    )
  })
})

const EMPTY: Fixture = {
  boardId: '',
  taskId: '',
  sectionId: '',
  labelId: '',
  commentId: '',
  inviteId: ''
}

// Reads the tree Fastify prints, one path segment per line.
function servedRoutes(tree: string): string[] {
  const served: string[] = []
  const path: string[] = []
  for (const line of tree.split('\n')) {
    const match = /^([│ ]*)[├└]── (\S+)(?: \(([^)]+)\))?/u.exec(line)
    if (!match) continue
    const [, indent = '', segment = '', methods = ''] = match
    path.length = indent.length / 4
    path.push(segment)
    const url = path.join('')
    if (!url.startsWith('/api/')) continue
    for (const method of methods.split(', ')) {
      if (method && method !== 'HEAD' && method !== 'OPTIONS') {
        served.push(`${method} ${url.slice('/api'.length)}`)
      }
    }
  }
  return served
}

const GROUPS = {
  public: 'Anyone, signed in or not',
  self: 'Any signed-in person, on their own data',
  viewer: 'Viewers of the board',
  editor: 'Editors of the board',
  admin: 'Admins of the board'
}

function permissionsDoc(declared: Declared[]): string {
  const sorted = declared.toSorted(
    (a, b) => a.url.localeCompare(b.url) || idOf(a).localeCompare(idOf(b))
  )
  const sections = Object.entries(GROUPS).map(([group, title]) => {
    const lines = sorted
      .filter(({ access }) =>
        access.on === 'board' ? group === access.role : group === access.on
      )
      .map(route => {
        const managed =
          route.access.on === 'board' && route.access.refusedOnManaged
            ? ', refused on a managed project'
            : ''
        return `- \`${idOf(route).replace(' ', ' /api')}\`${managed}`
      })
    return `## ${title}\n\n${lines.join('\n')}\n`
  })
  return [
    '# Permissions',
    '',
    'The role each API route needs, a role above it included. A caller who is not a member of the board gets 404, a member below the role gets 403.',
    '',
    'Generated from the route tables by `apps/backend/src/modules/permissions.test.ts`, which fails when this file is stale. After changing a route, run `npx vitest run src/modules/permissions.test.ts -u` in `apps/backend`.',
    '',
    ...sections
  ].join('\n')
}
