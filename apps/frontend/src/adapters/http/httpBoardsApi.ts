import * as wire from '@twake-tasks/api-contract'
import type { z } from 'zod'

import { ApiError, type BoardsApi } from '@/application/boards'
import { noReporting, type Reporting } from '@/application/reporting'

export type Send = (request: Request) => Promise<Response>

// What the backend's schema accepts, so tsc fails when a request drifts.
type Body<K extends keyof typeof wire> = (typeof wire)[K] extends z.ZodType
  ? z.input<(typeof wire)[K]>
  : never

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
      ? body.error
      : null
  } catch {
    return null
  }
}

const RETRY_MS = 1000
const MAX_RETRY_MS = 30_000

// Ids come from the address bar. Encoding keeps "..%2F" from reaching another
// API path; "." and ".." are refused because URLs resolve them even encoded.
const route = (strings: TemplateStringsArray, ...ids: string[]) =>
  String.raw(
    { raw: strings },
    ...ids.map(id => {
      if (id === '' || id === '.' || id === '..') {
        throw new ApiError(404, 'not_found')
      }
      return encodeURIComponent(id)
    })
  )

// The stream's messages each carry the version as their id.
async function readVersions(
  body: ReadableStream<Uint8Array>,
  onVersion: (version: number) => void
) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    const messages = buffer.split('\n\n')
    buffer = messages.pop() ?? ''
    for (const message of messages) {
      const id = message
        .split('\n')
        .find(line => line.startsWith('id:'))
        ?.slice(3)
        .trim()
      if (id) onVersion(Number(id))
    }
  }
}

export function httpBoardsApi(
  baseUrl: string,
  send: Send,
  reportMismatch: Reporting['reportApiMismatch'] = noReporting.reportApiMismatch
): BoardsApi {
  async function call<T>(
    method: string,
    path: string,
    body?: object,
    keepalive = false
  ) {
    const response = await send(
      new Request(new URL(`/api${path}`, baseUrl), {
        method,
        keepalive,
        ...(body && {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
      })
    )
    if (!response.ok) {
      throw new ApiError(response.status, await errorCode(response))
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  }

  const reported = new Set<string>()

  // The backend is released apart from this app: a response that drifts from
  // the contract is reported, once, and still used as it came.
  async function parsed<S extends z.ZodType>(
    name: string,
    schema: S,
    method: string,
    path: string,
    body?: object
  ) {
    const response = await call<z.output<S>>(method, path, body)
    const result = schema.safeParse(response)
    if (result.success) return result.data
    // Array indexes become `*` so a field drifted in many tasks reports once.
    const paths = [
      ...new Set(
        result.error.issues.map(issue =>
          issue.path
            .map(key => (typeof key === 'number' ? '*' : String(key)))
            .join('.')
        )
      )
    ]
    const mismatch = `${name} ${paths.join(' ')}`
    if (!reported.has(mismatch)) {
      reported.add(mismatch)
      reportMismatch(name, paths)
    }
    return response
  }

  function watch(path: string, onVersion: (version: number) => void) {
    const stop = new AbortController()
    void (async () => {
      let delay = RETRY_MS
      while (!stop.signal.aborted) {
        let retryAfterMs = 0
        try {
          const response = await send(
            new Request(new URL(`/api${path}`, baseUrl), {
              signal: stop.signal
            })
          )
          if (response.ok && response.body) {
            delay = RETRY_MS
            await readVersions(response.body, onVersion)
          } else if (response.status === 429) {
            retryAfterMs = Number(response.headers.get('retry-after')) * 1000
          }
        } catch {
          // Dropped: reconnect below, unless stopped.
        }
        await new Promise(resolve =>
          setTimeout(resolve, Math.max(delay, retryAfterMs || 0))
        )
        delay = Math.min(delay * 2, MAX_RETRY_MS)
      }
    })()
    return () => {
      stop.abort()
    }
  }

  return {
    settings: () =>
      parsed('settings', wire.settingsResponse, 'GET', '/settings'),
    agenda: (zone, days) => {
      const query = { zone, days } satisfies z.output<typeof wire.agendaQuery>
      return parsed(
        'agenda',
        wire.agendaResponse,
        'GET',
        `/agenda?${new URLSearchParams({ ...query, days: String(days) }).toString()}`
      )
    },
    listFilters: async () =>
      (await parsed('filters', wire.filtersResponse, 'GET', '/filters'))
        .filters,
    createFilter: filter =>
      parsed(
        'created filter',
        wire.createdFilterResponse,
        'POST',
        '/filters',
        filter satisfies Body<'newFilter'>
      ),
    updateFilter: (filterId, filter) =>
      call(
        'PATCH',
        route`/filters/${filterId}`,
        filter satisfies Body<'filterChanges'>
      ),
    // Sent as the page unloads when the undo notice is still open.
    deleteFilter: filterId =>
      call('DELETE', route`/filters/${filterId}`, undefined, true),
    setFilterFavorite: (filterId, favorite) =>
      call(favorite ? 'PUT' : 'DELETE', route`/filters/${filterId}/favorite`),
    labelNames: async () =>
      (await parsed('label names', wire.labelNamesResponse, 'GET', '/labels'))
        .labels,
    people: async () =>
      (await parsed('people', wire.peopleResponse, 'GET', '/people')).people,
    filteredTasks: async (filterId, zone) =>
      (
        await parsed(
          'filtered tasks',
          wire.tasksResponse,
          'GET',
          route`/filters/${filterId}/tasks` +
            `?${new URLSearchParams({ zone } satisfies Body<'zoneQuery'>).toString()}`
        )
      ).tasks,
    search: async text =>
      (
        await parsed(
          'search',
          wire.searchResponse,
          'GET',
          `/search?${new URLSearchParams({ q: text } satisfies Body<'searchQuery'>).toString()}`
        )
      ).tasks,
    myTasks: async () =>
      (await parsed('my tasks', wire.tasksResponse, 'GET', '/my-tasks')).tasks,
    listBoards: async () =>
      (await parsed('boards', wire.boardsResponse, 'GET', '/boards')).boards,
    getBoard: boardId =>
      parsed('board', wire.boardResponse, 'GET', route`/boards/${boardId}`),
    watchBoard: (boardId, onVersion) =>
      watch(route`/boards/${boardId}/events`, onVersion),
    createBoard: board =>
      parsed(
        'board',
        wire.boardResponse,
        'POST',
        '/boards',
        board satisfies Body<'newBoard'>
      ),
    transferTask: (boardId, taskId, to) =>
      parsed(
        'transfer',
        wire.transferResponse,
        'POST',
        route`/boards/${boardId}/tasks/${taskId}/transfer`,
        to satisfies Body<'transferTarget'>
      ),
    previewTransfer: (boardId, taskId, to) =>
      parsed(
        'transfer preview',
        wire.transferPreviewResponse,
        'POST',
        route`/boards/${boardId}/tasks/${taskId}/transfer/preview`,
        to satisfies Body<'transferTarget'>
      ),
    archiveTask: (boardId, taskId) =>
      call('POST', route`/boards/${boardId}/tasks/${taskId}/archive`, {}),
    trashTask: (boardId, taskId) =>
      call('DELETE', route`/boards/${boardId}/tasks/${taskId}`),
    restoreTask: (boardId, taskId) =>
      call('POST', route`/boards/${boardId}/tasks/${taskId}/restore`, {}),
    hiddenTasks: async (boardId, shelf) =>
      (
        await parsed(
          'hidden tasks',
          wire.hiddenTasksResponse,
          'GET',
          route`/boards/${boardId}/${shelf}`
        )
      ).tasks,
    renameBoard: (boardId, name) =>
      call('PATCH', route`/boards/${boardId}`, {
        name
      } satisfies Body<'boardRename'>),
    setBoardArchived: (boardId, archived) =>
      call(
        'POST',
        route`/boards/${boardId}/${archived ? 'archive' : 'unarchive'}`,
        {}
      ),
    listProjects: async () =>
      (await parsed('projects', wire.projectsResponse, 'GET', '/projects'))
        .projects,
    moveToProject: (boardId, projectId) =>
      call('POST', route`/boards/${boardId}/move`, {
        projectId
      } satisfies Body<'boardMove'>),
    getSharing: boardId =>
      parsed(
        'sharing',
        wire.sharingResponse,
        'GET',
        route`/boards/${boardId}/sharing`
      ),
    suggestPeople: async (boardId, query) =>
      (
        await parsed(
          'suggested people',
          wire.peopleResponse,
          'GET',
          route`/boards/${boardId}/sharing/people` +
            `?${new URLSearchParams({ q: query } satisfies Body<'peopleQuery'>).toString()}`
        )
      ).people,
    invite: (boardId, email, role) =>
      call('POST', route`/boards/${boardId}/invites`, {
        email,
        role
      } satisfies Body<'newInvite'>),
    cancelInvite: (boardId, inviteId) =>
      call('DELETE', route`/boards/${boardId}/invites/${inviteId}`),
    setMemberRole: (boardId, userId, role) =>
      call('PUT', route`/boards/${boardId}/members/${userId}`, {
        role
      } satisfies Body<'roleChange'>),
    removeMember: (boardId, userId) =>
      call('DELETE', route`/boards/${boardId}/members/${userId}`),
    setLayout: (boardId, layout) =>
      call('PUT', route`/boards/${boardId}/layout`, {
        layout
      } satisfies Body<'layoutChoice'>),
    setDefaultLayout: (boardId, layout) =>
      call('PUT', route`/boards/${boardId}/default-layout`, {
        layout
      } satisfies Body<'layoutChoice'>),
    setFavorite: (boardId, favorite) =>
      call(favorite ? 'PUT' : 'DELETE', route`/boards/${boardId}/favorite`),
    createTask: (boardId, task) =>
      parsed(
        'created task',
        wire.createdTaskResponse,
        'POST',
        route`/boards/${boardId}/tasks`,
        task satisfies Body<'newTask'>
      ),
    moveTask: (boardId, taskId, move) =>
      call(
        'POST',
        route`/boards/${boardId}/tasks/${taskId}/move`,
        move satisfies Body<'taskMove'>
      ),
    completeTask: (boardId, taskId, state) =>
      call('POST', route`/boards/${boardId}/tasks/${taskId}/complete`, {
        state
      } satisfies Body<'completion'>),
    editTask: (boardId, taskId, changes) =>
      call(
        'PATCH',
        route`/boards/${boardId}/tasks/${taskId}`,
        changes satisfies Body<'taskChanges'>
      ),
    getDescription: (boardId, taskId) =>
      parsed(
        'description',
        wire.descriptionResponse,
        'GET',
        route`/boards/${boardId}/tasks/${taskId}/description`
      ),
    setDescription: (boardId, taskId, edit) =>
      parsed(
        'description version',
        wire.descriptionVersionResponse,
        'PUT',
        route`/boards/${boardId}/tasks/${taskId}/description`,
        edit satisfies Body<'descriptionEdit'>
      ),
    listHistory: async (boardId, taskId) =>
      (
        await parsed(
          'history',
          wire.historyResponse,
          'GET',
          route`/boards/${boardId}/tasks/${taskId}/history`
        )
      ).entries,
    listComments: async (boardId, taskId) =>
      (
        await parsed(
          'comments',
          wire.commentsResponse,
          'GET',
          route`/boards/${boardId}/tasks/${taskId}/comments`
        )
      ).comments,
    addComment: async (boardId, taskId, body) => {
      await call('POST', route`/boards/${boardId}/tasks/${taskId}/comments`, {
        body
      } satisfies Body<'newComment'>)
    },
    addReaction: async (boardId, taskId, commentId, emoji) => {
      await call(
        'PUT',
        route`/boards/${boardId}/tasks/${taskId}/comments/${commentId}/reactions/${emoji}`
      )
    },
    removeReaction: async (boardId, taskId, commentId, emoji) => {
      await call(
        'DELETE',
        route`/boards/${boardId}/tasks/${taskId}/comments/${commentId}/reactions/${emoji}`
      )
    },
    listReminders: async (boardId, taskId) =>
      (
        await parsed(
          'reminders',
          wire.remindersResponse,
          'GET',
          route`/boards/${boardId}/tasks/${taskId}/reminders`
        )
      ).reminders,
    addReminder: async (boardId, taskId, reminder) => {
      await call(
        'POST',
        route`/boards/${boardId}/tasks/${taskId}/reminders`,
        reminder satisfies Body<'newReminder'>
      )
    },
    deleteReminder: (boardId, taskId, reminderId) =>
      call(
        'DELETE',
        route`/boards/${boardId}/tasks/${taskId}/reminders/${reminderId}`
      ),
    following: async (boardId, taskId) =>
      (
        await parsed(
          'following',
          wire.followingResponse,
          'GET',
          route`/boards/${boardId}/tasks/${taskId}/follow`
        )
      ).following,
    setFollowing: (boardId, taskId, following) =>
      call(
        following ? 'PUT' : 'DELETE',
        route`/boards/${boardId}/tasks/${taskId}/follow`
      ),
    listNotifications: async () =>
      (
        await parsed(
          'notifications',
          wire.notificationsResponse,
          'GET',
          '/notifications'
        )
      ).notifications,
    unreadByProject: async () =>
      (
        await parsed(
          'unread notifications',
          wire.unreadResponse,
          'GET',
          '/notifications/unread'
        )
      ).projects,
    markNotificationsRead: () => call('POST', '/notifications/read', {}),
    setAssignees: (boardId, taskId, userIds) =>
      call('PUT', route`/boards/${boardId}/tasks/${taskId}/assignees`, {
        userIds
      } satisfies Body<'assignment'>),
    createLabel: (boardId, label) =>
      parsed(
        'label',
        wire.label,
        'POST',
        route`/boards/${boardId}/labels`,
        label satisfies Body<'newLabel'>
      ),
    editLabel: (boardId, labelId, changes) =>
      parsed(
        'label',
        wire.label,
        'PATCH',
        route`/boards/${boardId}/labels/${labelId}`,
        changes satisfies Body<'labelChanges'>
      ),
    setLabels: (boardId, taskId, labelIds) =>
      call('PUT', route`/boards/${boardId}/tasks/${taskId}/labels`, {
        labelIds
      } satisfies Body<'labeling'>),
    createSection: (boardId, section) =>
      parsed(
        'section',
        wire.section,
        'POST',
        route`/boards/${boardId}/sections`,
        section satisfies Body<'newSection'>
      ),
    editSection: (boardId, sectionId, changes) =>
      call(
        'PATCH',
        route`/boards/${boardId}/sections/${sectionId}`,
        changes satisfies Body<'sectionChanges'>
      ),
    moveSection: (boardId, sectionId, move) =>
      call(
        'POST',
        route`/boards/${boardId}/sections/${sectionId}/move`,
        move satisfies Body<'sectionMove'>
      ),
    deleteSection: (boardId, sectionId, tasksTo) =>
      call(
        'DELETE',
        route`/boards/${boardId}/sections/${sectionId}`,
        tasksTo === undefined
          ? undefined
          : ({ tasksTo } satisfies Body<'sectionDeletion'>)
      )
  }
}
